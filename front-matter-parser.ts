import {treeIterator, ASCII, voidParser, walkParseTree, AdjustWalk, alpha, numeric, anyOf, sequence, repeat, token, peek, not, newline, whitespace, zeroOrMore, Parser, ParserResult, intercept, stringify, visualiseSource} from "./parser-combinator.ts"
import {RuleEngine} from "./misc.ts"

function assume(condition : any, message : string) : asserts condition {
    if (!condition) throw new Error(message);
}

export interface FrontMatterProperties { 
    [ index : string ] : string | string[]
}

class ParserError extends Error {
    constructor(message : string, result : ParserResult) {
        message = message + '\n' + visualiseSource(result)
        super(message, {cause: ('error' in result) ? result.error : result});
    }
}

// Parsing happens in 3 stages
//
// 1. Read the text into a parse tree
//    This is handled by the parser-combinator parsers
//
// 2. Simplify the parse tree into our AST
//    This is handled by...
const ParseTreeToAstRules = new RuleEngine();

// 3. Validate the results
//    This is handled by...
const AstValidateRules = new RuleEngine();



// YAML-like Language Definitions

// * String values

/** C-style identifier */
const identifier = sequence(alpha, repeat(0, 255, anyOf(alpha, numeric)));

/** Boolean string: "true" or "false" */
const bool = anyOf(token("true"), token("false"));

/** Line of text (excluding newline) */
const line = repeat(0, Number.MAX_SAFE_INTEGER, not(newline));

/** An indent, either a tab or 2-4 spaces */
const indent = anyOf(token(ASCII.TAB), repeat(2, 4, token(ASCII.SPACE)));

[identifier, bool, line, indent].forEach(parser => {
    
    // Simplify the value to a string

    ParseTreeToAstRules.add(parser, function astFromTextNode(node) {
        if ('error' in node) return new ParserError("Unexpected error", node);
        
        // Reduce the value to a simple string
        node.value = node.source.substring(node.indexStart, node.indexEnd);
        return node;
    })
});




// Multi-node string values

/** A paragraph of text, where follow-on lines are indented (see indent rule) */
const paragraph = sequence(
    line,
    zeroOrMore(sequence(newline, indent, line))
);

/**
 * Example:
 *  * One
 *  * 2
 *  * ...and three
 */
const list = zeroOrMore(
    sequence(
        newline, 
        indent, 
        token(ASCII.DASH), 
        sequence(peek(not(newline)), whitespace), 
        line
    )
);

[paragraph, list].forEach(parser => {

    ParseTreeToAstRules.add(parser, function astFromListOrParagraph(node) {

        if ('error' in node) return new ParserError("Unexpected error", node);

        const newValue = [];

        for (const nLine of treeIterator(node)) {

            if ('error' in nLine) return new ParserError("Unexpected error", nLine);
            if (nLine.author !== line) continue;
            
            // Reduce line to a string value
            ParseTreeToAstRules.processUntilFirstFail(nLine);
            
            newValue.push(nLine);
        }

        if (node.author === paragraph) {
            node.value = newValue.map(nLine => nLine.value).join('\n');
        } else {
            node.value = newValue;
        }
        
        return node;
        
    })

});




// Properties

/** property = "name: value\n" */
function property(name : Parser<any>, value : Parser<any>) : Parser<any> {

    const parser = sequence(
        name, 
        zeroOrMore(whitespace), 
        token(ASCII.COLON), 
        zeroOrMore(sequence(peek(not(newline)), whitespace)), 
        value, 
        zeroOrMore(sequence(peek(not(newline)), whitespace)),
        newline
    );

    const INDEX_NAME = 0;
    const INDEX_VALUE = 4;

    // Here we simplify child-nodes to a name-value pair
    ParseTreeToAstRules.add(parser, function astFromProperty(node) {

        if ('error' in node) return new ParserError("Unexpected error", node);
        
        assume('value' in node && Array.isArray(node.value), "Expected iterable value for known property");
        
        node.value = [ node.value[INDEX_NAME], node.value[INDEX_VALUE] ];
        return node;
    })

    return parser;

}



const propPublished = property(token("published"), bool);
const propTitle = property(token("title"), line);
const propDescription = property(token("description"), paragraph);
const propLayout = property(token("layout"), identifier);
const propAuthor = property(token("author"), line);
const propTags = property(token("tags"), list);

const knownProperties = [
    propPublished,
    propTitle,
    propDescription,
    propLayout,
    propAuthor,
    propTags,
];

const propUnknown = property(identifier, line);

ParseTreeToAstRules.add(propUnknown, function errorUnknownProperty(node) {
    return new ParserError("Unrecognised property", node)
})



const fence = sequence(token(ASCII.DASH+ASCII.DASH+ASCII.DASH), newline)

const frontMatterParser = sequence(
    fence, 
    repeat(1, Number.MAX_SAFE_INTEGER, anyOf(...knownProperties, propUnknown)),
    fence, 
);

ParseTreeToAstRules.add(frontMatterParser, function getAstFromFrontMatter(node) {
    if ('error' in node) return new ParserError("Unexpected error", node);

    // Reduce to properties
    const newValue = [];

    const maxPropDepth = 4; // (1) frontParser/sequence (2) repeat (3) anyOf (4) property
    for (const prop of treeIterator(node, maxPropDepth)) {
        if (! knownProperties.includes(prop.author)) continue;
        newValue.push(prop);
    }

    node.value = newValue;
    return node;
})





export function parse( content : string, defaults : Map<string, string|string[]> = new Map ) {

    // 0. Parse the content into a parse tree

    const parseTree = frontMatterParser(content, 0);

    if ('error' in parseTree) {
        visualiseSource(parseTree)
        const err = new ParserError(`Failed to parse front matter correctly:`, parseTree);

        return err;
    }

    // 1. Simplify the parse tree into an AST-like form

    const searchDepth = 32;
    const it = treeIterator(parseTree, searchDepth);

    for (const node of treeIterator(parseTree, searchDepth)) {
        
        if ('error' in node) {
            return new ParserError("Parse error.", node);
        } 
        
        const res = ParseTreeToAstRules.processUntilFirstFail(node);
        if (res instanceof Error) {
            return new ParserError("Error processing Parse Tree.", node);
        }

    }

    // 2. Process the AST
    
    const mKeyValue = new Map<string,string|string[]>(
        defaults.entries()
    );
 
    assume('value' in parseTree && Array.isArray(parseTree.value), "Malformed front matter in tree")
    parseTree.value.forEach(node => {
        
        if (node === parseTree) return;
    
        assume(knownProperties.includes(node.author), "Unrecognised node in tree");
        assume('value' in node && Array.isArray(node.value) && node.value.length === 2, "Malformed property tree");
    
        const nodeName = node.value[0];
        const nodeValue = node.value[1];
    
        const propName = nodeName.source.substring(nodeName.indexStart, nodeName.indexEnd);
        
        // Find the property value and set the property
    
        if (nodeValue.author !== list) {
            const propValue = nodeValue.source.substring(nodeValue.indexStart, nodeValue.indexEnd);
            mKeyValue.set( propName, propValue );
    
        } else {
    
            assume('value' in nodeValue && Array.isArray(nodeValue.value), "Malformed list tree");
    
            const arrValue = nodeValue.value.reduce((arr : string[], childNode : ParserResult) => {
                arr.push(
                    // Reduce children to strings
                    childNode.source.substring(childNode.indexStart, childNode.indexEnd)
                );
                return arr;
            }, []);
    
            mKeyValue.set(propName, arrValue);

        }

    });

    // 3. Return the results!

    return { 
        return { 
    return { 
        props: mKeyValue, 
        frontMatterLength: parseTree.indexEnd + 1
    };

}

function findNodeWithAuthor(author : Parser, root : ParserResult, maxDepth = 2) : ParserResult | undefined {

    for (const node of treeIterator(root, maxDepth)) {
        if (node.author === author) {
            return node;
        }
    }

    return;

}