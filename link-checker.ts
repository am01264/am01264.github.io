import {not, stringify, token, sequence, zeroOrMore, oneOrMore, repeat, anyOf, whitespace, optional, Parser, ParserResult, intercept, visualiseError} from "./parser-combinator.ts"

const ASTMark = Symbol()

enum NodeType {
    LinkDestination,
}

enum ChildState {
    HasChildren, NoChildren
}

type ASTNode = ParserResult<string> & {
    [index : symbol]: {
        type: NodeType
    }
}

function markAST( nodeType : NodeType, parser : Parser<string>, childState : ChildState = ChildState.HasChildren) {
    
    if (childState === ChildState.NoChildren) {
        // If there's no children, convert the inner parse tree with a simple string
        parser = stringify(parser);
    }

    return intercept(parser, result => {
        
        (result as any)[ASTMark] = {
            type: nodeType
        }

        return result;

    })

}

function isASTNode<T>( thing : any ) : thing is ASTNode {
    return (typeof thing === "object") && ASTMark in thing;
}

function walkAST<T>( node : ParserResult<T>, cb : ( astNode : ASTNode ) => void) {

    if (typeof node !== "object") return;
    if ('error' in node) return;

    if (isASTNode<T>(node)) {
        cb(node)
    }

    if ('value' in node && Array.isArray(node.value)) {
        for (const childNode of node.value) {
            walkAST(childNode, cb);
        }
    }

}

/**
 * This section is based on the CommonMark grammar. 
 * https://spec.commonmark.org/0.30/#links 
 * 
 * We match everything EXCEPT for:
 * 0. Inline links without a destination (`[link text]()` or `[link text]("link title")`)
 * 1. Full Reference Links (`[link text][reference]`)
 * 2. In link text and titles, we allow more than one newline.
 * */

const spaceOrTab = anyOf(token(" "), token("\t"));

const linkText = sequence(
    token("["),
    zeroOrMore(not(token("]"))),
    token("]")
);

const linkDestination = anyOf(
    sequence(token("<"), markAST(NodeType.LinkDestination, zeroOrMore(not(token(">")))), token(">")),
    markAST(NodeType.LinkDestination, oneOrMore(not(whitespace)))
);

const linkTitle = sequence(
    token('"'),
    zeroOrMore(anyOf(
        token('\"'),
        not(token('"'))
    )),
    token('"')
);

const inlineLink = sequence(linkText, token("("), zeroOrMore(spaceOrTab), linkDestination, optional(sequence(oneOrMore(spaceOrTab), linkTitle)), zeroOrMore(spaceOrTab), token(")"));

const linkLabel = sequence(
    token("["),
    repeat(1, 999, (anyOf(
        token("\]"),
        not(token("]"))
    ))),
    token("]")
);

const linkReferenceDefinition = sequence(linkLabel, token(":"), zeroOrMore(spaceOrTab), linkDestination, optional(sequence(oneOrMore(spaceOrTab), linkTitle)))


function parseLinksFromMarkdown( markdown : string ) {
console.group("parseLinksFromMarkdown")
    const linkParser = anyOf(inlineLink, linkLabel);

    const links : string[] = [];

    for (let ix = 0; ix < markdown.length; ix++) {

        console.info(`Starting parse at ${ix}`)
        while (ix < markdown.length && markdown[ix] !== "[") { ix++ }
        
        if (ix >= markdown.length) {
            console.info("Reached end of document.")
            break;
        }

        console.info(`Fast forwarded to ${ix}. Attempting link parse...`)

        // Fast forward
        const result = linkParser(markdown, ix)

        if ('error' in result) {
            // Just means we didn't parse a link this time
            ix = result.index;
            console.warn(`Failed to parse link at ${ix}, %o.`, result.error)

            const cause = result.error?.cause;
            if (Array.isArray(cause)) {
                cause.forEach(c => {
                    const visual = visualiseError(c);
                    console.log(visual);
                });
            } 
            continue;
        };

        walkAST(result, (node) => {
            if ('error' in node) return;
            if (node[ASTMark].type !== NodeType.LinkDestination) return;
            
            const link = String(node.value);
            console.info("Link found: %s", link)
            links.push(link)
        })

        ix = result.index;

    }
console.groupEnd();
    return links;

}

type TryLinkOptions = { 
    baseURL : string | URL | undefined, 
    timeout: number,
    redirectsAllowed: boolean
}

async function tryLink( l : string, options : TryLinkOptions = { baseURL: undefined, timeout: 5000, redirectsAllowed: false } ) {

    // First let's confirm it's a valid URL

    let url : URL;

    try {
        url = new URL(l, options.baseURL)
    } catch (ex) {

        if (ex instanceof TypeError) {
            // Invalid URLs result in TypeErrors
            return new SyntaxError("Invalid URL", {cause: ex})
        } else {
            throw ex;
        }

    }

    // Check we're using a support protocol

    if (! /^http[s]?[:]?$/.test(url.protocol)) {
        return new ReferenceError("Expected http or https link", {cause: url.protocol});
    }

    // Attempt to load the URL

    let result : Response;
    
    const timeoutControl = new AbortController();
    setTimeout(() => void timeoutControl.abort(), options.timeout)
    
    try {
        result = await fetch(url, {
            redirect: (options.redirectsAllowed === true) ? "follow" : "error",
            signal: timeoutControl.signal
        })

    } catch (ex) {

        if (typeof ex.name === 'string' && ex.name === "AbortError") {
            // AbortError is our timeout
            console.trace("Request timed out on URL: %s", l);
            return new RangeError("Request timed out", { cause: ex })

        } else if (ex instanceof TypeError) {
            // TypeError likely due to no internet access
            console.trace("Unable to fetch URL: %s", l);
            return ex;

        } else {
            // Unknown error
            throw ex;
        }

    }

    if (result.redirected) {
        console.info("Link redirected: %o", {from: l, to: result.url.toString()})
    }

    return result;

}


type CheckLinksOptions = TryLinkOptions & { abortOnFirstFail : boolean }

export async function checkLinks( markdown : string, options : Partial<CheckLinksOptions> = { baseURL: "https://andrewmcauley.co.uk/", timeout: 5000, redirectsAllowed: true, abortOnFirstFail: false } ) {

    options.timeout = options.timeout || 5000;

    const arrLinks = parseLinksFromMarkdown(markdown);
    const arrResults = [];

    for (let ix = 0; ix < arrLinks.length; ix++) {
        const sLink = arrLinks[ix];
        const result = await tryLink(sLink);
        arrResults.push(result);
        
        if (result instanceof Error && options.abortOnFirstFail === true) {
            return arrResults;
        }
    }
    
    return arrResults;
}

// Test Cases to add
//
// Expect URL
//
// [//]: # "How Can I Keep Updated With Your Work?"
// [testimonial on Gingko]: /gingko-testimonial
// [site's code & content](https://github.com/am01264/am01264.github.io)
//
// Expect No URL
//
// [//]: "What immediate benefits can I give you?"      <!-- not currently handled
// [thank you letter] I recently wrote                  <!-- not currently handled