import {assert, assertEquals} from "https://deno.land/std@0.144.0/testing/asserts.ts"

import {not, AdjustWalk, walkParseTree, peek, printable, token, sequence, zeroOrMore, oneOrMore, repeat, anyOf, whitespace, optional, Parser, ParserResult, intercept, visualiseSource} from "./parser-combinator.ts"


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
    // |> [hello] <| (http://example.org)
    token("["),
    zeroOrMore(not(token("]"))),
    token("]")
);

const linkDestination = anyOf(

    // <https://example.org>
    sequence(token("<"), zeroOrMore(not(token(">")))), token(">"),

    // https://example.org
    oneOrMore(anyOf(
        token("\\("), token("\\)"),
        sequence(
            peek(not(anyOf(
                whitespace, token("("), token(")")
            ))), 
            printable
        )
    ))
);

const linkTitle = anyOf(
    // "hello"
    sequence(
        token('"'), 
        zeroOrMore(anyOf(token('\\"'),not(token('"')))),
        token('"')
    ),
    
    // 'ooooo'
    sequence(
        token("'"), 
        zeroOrMore(anyOf(token("\\'"),not(token("'")))), 
        token("'")
    ),
    
    // (wait, what?)
    sequence(
        token("("), 
        zeroOrMore(anyOf(
            token("\\("), 
            token("\\)"), 
            not(anyOf((token("(")), token(")"))
        ))), 
        token(")")
    ),
);

const inlineLink = sequence(
    linkText, 
    anyOf(
        // [hello](/world)
        sequence(
            token("("), 
            zeroOrMore(spaceOrTab), 
            linkDestination,
            zeroOrMore(spaceOrTab), 
            token(")")
        ),

        // [hello](/world "time to die")
        sequence(
            token("("), 
            zeroOrMore(spaceOrTab), 
            linkDestination,
            oneOrMore(spaceOrTab), 
            linkTitle,
            zeroOrMore(spaceOrTab), 
            token(")")
        ),

        // [minions-go]("bello!")
        sequence(
            token("("), 
            zeroOrMore(spaceOrTab), 
            linkTitle,
            zeroOrMore(spaceOrTab), 
            token(")")
        )
    ));

const linkLabel = sequence(
    token("["),
    repeat(1, 999, (anyOf(
        token("\\]"),
        not(token("]"))
    ))),
    token("]")
);

const linkReferenceDefinition = sequence(linkLabel, token(":"), zeroOrMore(spaceOrTab), linkDestination, optional(sequence(oneOrMore(spaceOrTab), linkTitle)))

const linkReferenceFull = sequence(linkLabel, linkLabel);
const linkReferenceCollapsed = sequence(linkLabel, token("["), token("]"))
const linkReferenceShortcut = linkLabel

const link = anyOf(
    inlineLink,
    linkReferenceDefinition,
    linkReferenceFull,
    linkReferenceCollapsed,
    linkReferenceShortcut
);


Deno.test({
    name: 'Inline Link',
    fn() {

        const tests = [
            [ '[test](url)', 'url' ],
            [ '[test](url "title")', 'url' ],
        ];

        tests.forEach(([test, expect]) => {
            
            const result = inlineLink(test, 0);
            
            console.trace("Parse completed");

            if ('error' in result) {
                console.log(visualiseSource(result));
                throw result.error;
            }

            walkParseTree(result, node => {
                if (typeof node !== "object") return AdjustWalk.StopDescent;
                
                if ('error' in node) {
                    console.log(visualiseSource(node));
                    throw node.error;
                }
                
                const actual = node.source.substring(node.indexStart, node.indexEnd);
                assertEquals(actual, expect);
                return AdjustWalk.Continue;
            })

        })

    }
})


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
            ix = result.indexEnd;
            console.warn(`Failed to parse link at ${ix}, %o.`, result.error)

            const cause = result.error?.cause;
            if (Array.isArray(cause)) {
                cause.forEach(c => {
                    const visual = visualiseSource(c);
                    console.log(visual);
                });
            } 
            continue;
        };

        walkParseTree(result, node => {
            if (typeof node !== "object") return AdjustWalk.StopDescent;
            if ('error' in node) return AdjustWalk.StopDescent;
            
            if (node.author === linkDestination) {
                const url = node.source.substring(node.indexStart, node.indexEnd);
                console.info("Link found: %s", url)
                links.push(url);
            }

            return AdjustWalk.Continue;
        })

        ix = result.indexEnd;

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