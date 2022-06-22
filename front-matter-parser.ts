import {assert} from "https://deno.land/std@0.144.0/testing/asserts.ts"
import {ASCII, alpha, numeric, anyOf, sequence, repeat, token, peek, not, newline, printable, whitespace, zeroOrMore, Parser, ParserResult, isError} from "./parser-combinator.ts"

const MAX_FRONT_MATTER_LENGTH = 1024;


async function run() {
    const dirBase = "./_posts";

    const files = [];

    for await (const inode of Deno.readDir("./_posts")) {
        if (! inode.isFile) continue;
        if (! inode.name.endsWith('.md')) continue;
        files.push(`${dirBase}/${inode.name}`);
    }

    for (const file of files) {

        const content = await Deno.readTextFile(file);
        
        const alphanumeric = anyOf(alpha, numeric);
        const identifier = sequence(alpha, repeat(0, 255, anyOf(alpha, numeric)))
        const bool = anyOf(token("true"), token("false"));

        const line = repeat(0, Number.MAX_SAFE_INTEGER, sequence(
            peek(not(newline)),
            anyOf(printable, whitespace)
        ))

        const indent = anyOf(token(ASCII.TAB), repeat(2, 4, token(ASCII.SPACE)));

        const paragraph = sequence(
            line,
            zeroOrMore(sequence(newline, indent, line))
        );

        const list = zeroOrMore(sequence(newline, indent, token(ASCII.DASH), line))

        function property(name : Parser<any>, value : Parser<any>) : Parser<any> {
            return sequence(
                name, 
                zeroOrMore(whitespace), 
                token(ASCII.COLON), 
                zeroOrMore(whitespace), 
                value, 
                peek(not(newline)), 
                newline
            );
        }

        const knownProperties = anyOf(
            property(token("published"), bool),
            property(token("title"), line),
            property(token("description"), paragraph),
            property(token("layout"), identifier),
            property(token("author"), line),
            property(token("tags"), list)
        );

        const frontMatterParser = sequence(
            fence,
            zeroOrMore(knownProperties),
            fence
        );

        console.dir(frontMatterParser(content, 0));

    }
}

// run()

function fence(source : string, index : number) : ParserResult<string> {

    let ixSeek;
    const MAX_SEEK = Math.min(index + 3, source.length);

    for (ixSeek = index; ixSeek < MAX_SEEK; ixSeek++) {
        if (source[ixSeek] !== ASCII.DASH) {
            return {
                source,
                index: ixSeek,
                error: new SyntaxError("Expected front-matter fence `---`."),
            };
        }
    }

    if ((ixSeek - index) < 3) {
        return {
            source,
            index: ixSeek,
            error: new SyntaxError("Expected front matter fence `---`, but got EOF.")
        }
    }

    return {
        source,
        index: ixSeek,
        value: source.substring(index, ixSeek)
    }

}


Deno.test({
    name: fence.name,
    fn() {

        (<Array<[string, number, boolean]>><unknown>[
            ['---', 0, true],
            ['-=-', 0, false],
            [' ---', 0, false],
            ['--- ', 0, true],
        ]) 
        .forEach(([source, index, shouldPass]) => {

            const result = fence(source, index);

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })
    }
})