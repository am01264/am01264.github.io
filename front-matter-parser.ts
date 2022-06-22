import {assert} from "https://deno.land/std@0.144.0/testing/asserts.ts"
import {ASCII, optional, alpha, numeric, anyOf, sequence, repeat, token, peek, not, newline, printable, whitespace, zeroOrMore, Parser, ParserResult, intercept, isError} from "./parser-combinator.ts"

const MAX_FRONT_MATTER_LENGTH = 1024;

export interface FrontMatterProperties { 
    [ index : string ] : string | string[]
}

class ParserError extends Error {
    friendlyMessage : string = '';
}

function stringify(parser : Parser<any>) : Parser<string> {
    return intercept(parser, result => {
        
        if ('value' in result) {
            result.value = reduceToString(result)
        }

        return result;
    });
}

export function parse( content : string, defaults : FrontMatterProperties = {} ) {

        const props = {...defaults}

        const alphanumeric = anyOf(alpha, numeric);
        const identifier = stringify(sequence(alpha, repeat(0, 255, anyOf(alpha, numeric))));
        const bool = stringify(anyOf(token("true"), token("false")));

        const line = stringify(repeat(0, Number.MAX_SAFE_INTEGER, not(newline)));

        const indent = anyOf(token(ASCII.TAB), repeat(2, 4, token(ASCII.SPACE)));

        const paragraph = stringify(sequence(
            line,
            zeroOrMore(intercept(sequence(newline, indent, line), result => {
                if ('error' in result) return;
                const INDEX_INDENT = 1;
                result.value[INDEX_INDENT] = '';
                return result;
            }))
        ));

        const list = zeroOrMore(intercept(
            sequence(
                newline, 
                indent, 
                token(ASCII.DASH), 
                sequence(peek(not(newline)), whitespace), 
                line
            ),
            function collapseToListValue(result) {
                if ('error' in result) return;

                // Simplify the result to just the content
                const INDEX_LINE = 4;
                const value = result.value[INDEX_LINE].value;

                result.value = value;
                return result;
            }
        ));

        function property(name : Parser<any>, value : Parser<any>) : Parser<any> {
            return intercept(
                sequence(
                    name, 
                    zeroOrMore(whitespace), 
                    token(ASCII.COLON), 
                    zeroOrMore(sequence(peek(not(newline)), whitespace)), 
                    value, 
                    zeroOrMore(sequence(peek(not(newline)), whitespace)),
                    newline
                ),
                (result) => {

                    if (! ('error' in result)) {

                        // Record property values
                        const INDEX_NAME = 0;
                        const INDEX_VALUE = 4;

                        const name =  result.value[INDEX_NAME].value;
                        const value = reduceToValue(result.value[INDEX_VALUE]);

                        props[name] = value;
                    }
                }
            );

            
        }

        const knownProperties = anyOf(
            property(token("published"), bool),
            property(token("title"), line),
            property(token("description"), paragraph),
            property(token("layout"), identifier),
            property(token("author"), line),
            property(token("tags"), list),
        );

        const fence = sequence(token(ASCII.DASH+ASCII.DASH+ASCII.DASH), newline)

        const frontMatterParser = sequence(
            fence, 
            repeat(1, Number.MAX_SAFE_INTEGER, knownProperties),
            fence, 
        );

        const result = frontMatterParser(content, 0);
        
        if ('error' in result) {
            const lines = result.source.substring(0, result.index + 1).split('\n')
            const err = new ParserError(`Failed to parse front matter correctly

Found issue on line ${lines.length}, column ${lines[lines.length - 1].length}:
    > ${result.source.substring(result.index, result.index + 80).split('\n').join('\n    > ') + '...'}
`
                , {cause: result.error}
                );

            return err;
        }

        return { 
            meta: props, 
            frontMatterLength: result.index + 1
        };
        
}

function reduceToValue(a : ParserResult<any>) {
    if (typeof a !== "object") return a;
    
    if ('value' in a) {
        if (Array.isArray(a.value)) {
            a.value = a.value.map(b => reduceToValue(b.value))
        } 
        return a.value;
    } 
}

function reduceToString(a : ParserResult<any>) : string{

    if ('error' in a) return '';
    if (typeof a?.value === "undefined") return '';
    if (typeof a?.value === "string") return a.value;

    if (Array.isArray(a.value)) {
        return a.value.reduce(
            (prev : string, curr : ParserResult<any>) => prev+reduceToString(curr)
            , ''
            )
    }

    return String(a.value);

}