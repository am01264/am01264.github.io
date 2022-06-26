import {treeIterator, ASCII, voidParser, walkParseTree, AdjustWalk, alpha, numeric, anyOf, sequence, repeat, token, peek, not, newline, whitespace, zeroOrMore, Parser, ParserResult, intercept, stringify, visualiseSource} from "./parser-combinator.ts"


export interface FrontMatterProperties { 
    [ index : string ] : string | string[]
}

class ParserError extends Error {
    friendlyMessage : string = '';
}



const identifier = sequence(alpha, repeat(0, 255, anyOf(alpha, numeric)));
const bool = anyOf(token("true"), token("false"));

const line = repeat(0, Number.MAX_SAFE_INTEGER, not(newline));

const indent = anyOf(token(ASCII.TAB), repeat(2, 4, token(ASCII.SPACE)));

const paragraph = sequence(
    line,
    zeroOrMore(sequence(newline, indent, line))
);

const list = zeroOrMore(
    sequence(
        newline, 
        indent, 
        token(ASCII.DASH), 
        sequence(peek(not(newline)), whitespace), 
        line
    )
);

function property(name : Parser<any>, value : Parser<any>) : Parser<any> {
    return sequence(
        name, 
        zeroOrMore(whitespace), 
        token(ASCII.COLON), 
        zeroOrMore(sequence(peek(not(newline)), whitespace)), 
        value, 
        zeroOrMore(sequence(peek(not(newline)), whitespace)),
        newline
    );
}

property.INDEX_NAME = 0;
property.INDEX_VALUE = 4;


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

const fence = sequence(token(ASCII.DASH+ASCII.DASH+ASCII.DASH), newline)

const frontMatterParser = sequence(
    fence, 
    repeat(1, Number.MAX_SAFE_INTEGER, anyOf(...knownProperties)),
    fence, 
);

export function parse( content : string, defaults : FrontMatterProperties = {} ) {

        // 0. Parse the content into a parse tree

        const props = {...defaults}
        const result = frontMatterParser(content, 0);

        if ('error' in result) {
            visualiseSource(result)
            const err = new ParserError(`Failed to parse front matter correctly:\n${visualiseSource(result)}`, {cause: result.error});

            return err;
        }




        // 1. Simplify the parse tree into an AST-like form

        const searchDepth = 32;
        const it = treeIterator(result, searchDepth);

        for (
            let searchState = AdjustWalk.Continue, iteratorState = it.next(searchState);
            iteratorState.done !== true;
            iteratorState = it.next(searchState)
        ) {
            const node = iteratorState.value;

            if ('error' in node) {
                // Stop searching any deeper
                searchState = AdjustWalk.StopDescent;
                // ...and move onto the next sibling in the parse tree
                continue;
            } else {
                searchState = AdjustWalk.Continue;
            }

            // Simplify the parse tree

            switch (node.author) {
                case bool:
                case line:
                case identifier:
                    // Reduce the value to a simple string
                    node.value = node.source.substring(node.indexStart, node.indexEnd);
                    break;

                case propPublished:
                case propTitle:
                case propDescription:
                case propLayout:
                case propAuthor:
                case propTags:
                    // Reduce children to name-value pair
                    if (! ('value' in node) || ! Array.isArray(node.value)) {
                        throw new TypeError("Expected iterable value for known property");
                    }

                    node.value = [ node.value[property.INDEX_NAME], node.value[property.INDEX_VALUE] ];
                
                case paragraph:
                case list:
                {
                    // Reduce to lines
                    const newValue = [];

                    for (const nLine of treeIterator(node)) {
                        if ('error' in nLine) continue;
                        if (nLine.author !== line) continue;
                        
                        // Reduce line to a string value & add to list
                        nLine.value = nLine.source.substring(nLine.indexStart, nLine.indexEnd);
                        newValue.push(nLine);
                    }

                    if (node.author === paragraph) {
                        node.value = newValue.map(nLine => nLine.value).join('\n');
                    } else {
                        node.value = newValue;
                    }

                    break;
                }

                case frontMatterParser:
                {
                    // Reduce to properties
                    const newValue = [];

                    const maxPropDepth = 4; // (1) frontParser/sequence (2) repeat (3) anyOf (4) property
                    for (const prop of treeIterator(node, maxPropDepth)) {
                        if (! knownProperties.includes(prop.author)) continue;
                        newValue.push(prop);
                    }

                    node.value = newValue;
                }
                    

                default:
                    console.log('Error simplifying %o', node.author)
                    console.log(visualiseSource(node))
                    console.log('\n')

                    throw ReferenceError("Failed to simplify parse tree: Unrecognised parser created this node", {cause: node});

            }

        } // end for








        // 2. Process the AST
        
        /*
            We'll call the simplified parse tree the AST:

            AST = {
                properties[]: [name, value]
            }

            name = token.value === string;
            value = (any of props)

        */


        const maxPropDepth = 2;
        for (const prop of treeIterator(result, maxPropDepth)) {
            if ('error' in prop) continue;

            const attemptStringProperty = (propParser : Parser, propName : string, valueParser : Parser, valueName : string) => {

                const node = findNodeWithAuthor(bool, prop, 2);

                if (!node) throw new ReferenceError(`Expected ${valueName} token for "${propName}" property`, {cause: prop});

                if (! ('value' in node && typeof node.value === "string")) {
                    throw new TypeError(`Expected string value for ${propName}`)
                }
                
                props["published"] = node.value;

            }

            switch (prop.author) {

                case propPublished:
                    const nBool = findNodeWithAuthor(bool, prop, 2);
                    if (!nBool || 'error' in nBool) throw new ReferenceError("Expected boolean token for `published` property", {cause: prop});
                    if (typeof nBool.value !== "string") throw new TypeError("Expected string value on bool", {cause: nBool})
                    props["published"] = nBool.value;
                    break;

                case propTitle:
                    const nLink = findNodeWithAuthor(line, prop, 2);
                    if (!nLink || 'error' in nLink) throw new ReferenceError("Expected line of text for `title` property", {cause: prop});
                    if (typeof nLink.value !== "string") throw new TypeError("Expected string value on line", {cause: nLink})
                    props["title"] = nLink.value;
                    break;

                case propDescription:
                    const nParagraph = findNodeWithAuthor(paragraph, prop, 2);
                    if (!nParagraph || 'error' in nParagraph) throw new ReferenceError("Expected paragraph for `description` property", {cause: prop});
                    if (typeof nParagraph.value !== "string") throw new TypeError("Expected string value on paragraph", {cause: nParagraph})
                    props["description"] = nParagraph.value;
                    break;


                case propLayout:
                    const nIdentifier = findNodeWithAuthor(identifier, prop, 2);
                    if (!nIdentifier || 'error' in nIdentifier) throw new ReferenceError("Expected identifier token for `layout` property", {cause: prop});
                    if (typeof nIdentifier.value !== "string") throw new TypeError("Expected string value on identifier", {cause: nIdentifier})
                    props["layout"] = nIdentifier.value;
                    break;

                case propAuthor:
                    const nLine = findNodeWithAuthor(line, prop, 2);
                    if (!nLine || 'error' in nLine) throw new ReferenceError("Expected line of text for `author` property", {cause: prop});
                    if (typeof nLine.value !== "string") throw new TypeError("Expected string value on line", {cause: nLine})
                    props["author"] = nLine.value;
                    break;

                case propTags:
                    const arrList = [];
                    
                    for (const nLine of treeIterator(prop, 2)) {
                        if (nLine.author !== line || 'error' in nLine) continue;
                        if (typeof nLine.value !== "string") throw new TypeError("Expected string value on line", {cause: nLine});
                        arrList.push(nLine.value)
                    }

                    props["tags"] = arrList;
                    break;

                default:
                    console.log('Error simplifying %o', prop.author)
                    console.log(visualiseSource(prop))
                    console.log('\n')

                    throw new TypeError("Unrecognised property", {cause: prop})
            }
        }





        // 3. Return the results!

        return { 
            meta: props, 
            frontMatterLength: result.indexEnd + 1
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