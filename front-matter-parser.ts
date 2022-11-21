import {treeIterator, ASCII, voidParser, walkParseTree, AdjustWalk, alpha, numeric, anyOf, sequence, repeat, token, peek, not, newline, whitespace, zeroOrMore, Parser, ParserResult, intercept, stringify, visualiseSource} from "./parser-combinator.ts"
import {RuleEngine} from "./misc.ts"
import {assertEquals} from "https://deno.land/std@0.144.0/testing/asserts.ts"

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

        for (const nLine of treeIterator(node, 4 /* zeroOrMore + sequence + line OR sequence + zeroOrMore + sequence + line */)) {

            if ('error' in nLine) return new ParserError("Unexpected error", nLine);
            if (nLine.author !== line) continue;
            
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

export enum PropertyKind {
    Boolean,
    Line,
    Paragraph,
    Identifier,
    List
}

interface PropertyMetadata {
    property: string,
    type: PropertyKind,
    defaultsTo: any
}

const PropertyKindParserMap = new Map([
    [PropertyKind.Boolean, bool],
    [PropertyKind.Identifier, identifier],
    [PropertyKind.Line, line],
    [PropertyKind.List, list],
    [PropertyKind.Paragraph, paragraph]
])




const fence = sequence(token(ASCII.DASH+ASCII.DASH+ASCII.DASH), newline)



export function parse( content: string, properties: ArrayLike<PropertyMetadata>) {

    // Build the parser based on the given properties

    const knownProperties = 
        Array.from(properties)
        .map(n => property(token(n.property), PropertyKindParserMap.get(n.type) || line));

    const frontMatterParser = sequence(
        fence, 
        repeat(1, Number.MAX_SAFE_INTEGER, anyOf(...knownProperties)),
        fence, 
    );

    // 0. Parse the content

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

    const mKeyValue = new Map(
        Array.from(properties).map(n => [ n.property, n.defaultsTo ])
    );

    for (const node of treeIterator(parseTree, 4 /* front parser + repeat + anyOf + property */)) {
        
        if ('error' in node) continue;
        if (! knownProperties.includes(node.author)) continue;

        assume('value' in node && Array.isArray(node.value) && node.value.length === 2, "Badly formed parse tree for property");

        // Property found, extract the property-name & value

        const nodeName = node.value[0];
        const nodeValue = node.value[1];

        if ('error' in nodeName || 'error' in nodeValue) continue;

        function getStringFromParseResult( node : ParserResult ) {
            return node.source.substring(node.indexStart, node.indexEnd);
        }

        const propName = getStringFromParseResult(nodeName);

        // The value could be an array of strings, or just a string, so handle both cases
        const propValue = (! Array.isArray(nodeValue.value)) 
            ? getStringFromParseResult(nodeValue)
            : Array
                .from(nodeValue.value as ParserResult[])
                .reduce<string[]>((arr : string[], childNode : ParserResult) => {
                    arr.push(getStringFromParseResult(childNode));
                    return arr;
                }, []);

        // Lock in the value for this property
        mKeyValue.set(propName, propValue);

    }

    // 3. Return the results!

    return { 
        props: mKeyValue, 
        frontMatterLength: parseTree.indexEnd + 1
    };

}

Deno.test({
    name: parse.name,
    fn() {

        const expect = new Map();
        expect.set('title', 'hello');

        const actual = parse(
            '---\ntitle: hello\n---\n',
            [{
                property: 'title',
                type: PropertyKind.Line,
                defaultsTo: ''
            }]
        );

        if (actual instanceof Error) throw actual;

        assertEquals(expect, actual.props);
console.log(actual.props)
    }
})