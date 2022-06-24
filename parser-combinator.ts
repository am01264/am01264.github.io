import {assert, assertEquals} from "https://deno.land/std@0.144.0/testing/asserts.ts"

export const ASCII = {
    VERTICAL_TAB : '\v',
    FORM_FEED : '\f',
    SPACE : ' ',
    DASH : '-',
    COLON : ':',
    TAB : '\t',
    NEWLINE : '\n',
    CARRIAGE_RETURN : '\r',
}

type ParseSource<T = string> = string | ArrayLike<T>

interface ParserResultCommon<BaseType, ArrayType extends ParseSource<BaseType>> {
    source: ArrayType;
    indexEnd: number;
    indexStart: number;
}

interface ParserError<T, A extends ParseSource<T>> extends ParserResultCommon<T, A> {
    error: Error;
}

interface ParserSuccess<T, A extends ParseSource<T>> extends ParserResultCommon<T, A> {
    value?: T | ParserResult<T,A>[] | A;
}

export type ParserResult<T = string, A extends ParseSource<T> = string> = ParserSuccess<T, A> | ParserError<T, A>;

export type Parser<T = string, A extends ParseSource<T> = string> = (source : A, index : number) => ParserResult<T, A>





export function intercept<T = string, A extends ParseSource<T> = string>( parser : Parser<T, A>, cb : (result : ParserResult<T, A>) => any ) : Parser<T, A> {

    return (source : A, index : number) => {
        const result = parser(source, index);
        const response = cb(result);

        if (response) return response;
        else return result;
    }


}






export function peek<T = string, A extends ParseSource<T> = string>( parser : Parser<T, A>, offset = 0 ) : Parser<T, A> {
    return (source : A, index : number) => {
        // Push the index forward
        const result = parser(source, index + offset);

        // Rewind the index
        result.indexEnd = index;
        return result;
    }
}

Deno.test({
    name: peek.name,
    fn() {
        const failure : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd : index, error: new Error("Test only") });
        const success : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index + 1, value: '' });

        const test : Array<[Parser,boolean,number]> = [
            [failure, false, 0],
            [success, true, 0]
        ];

        test.forEach(([parser, shouldPass, index], testNo) => {
            const result = peek(parser)('', 0);
            assert(result.indexEnd === index, `Index mismatch (${result.indexEnd} vs ${index} @ test # ${testNo})`);

            if (shouldPass) assert(!isError(result), `Expected test pass (test # ${testNo})`)
            else assert(isError(result), `Expected test fail (test # ${testNo})`)            
        })

    }
})






export function not<T = string, A extends ParseSource<T> = string>( parser : Parser<T, A> ) : Parser<T, A> {
    return (source : A, index : number) => {
        const res = parser(source, index);

        if ('error' in res) {
            return { 
                source, 
                indexStart: index,
                indexEnd : res.indexEnd + 1, 
                value: undefined
            };
        } else {
            const err = new SyntaxError("Token not allowed");
            err.cause = res;

            return { 
                source, 
                indexStart: index,
                indexEnd: index, 
                error: err
            };
        }
    }
}


Deno.test({
    name: not.name,
    fn() {
        const failure : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index, error: new Error("Test only") });
        const success : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index + 1, value: undefined });

        const tests : Array<[Parser, boolean, number]> = [
            [ failure, true, 1 ],
            [ success, false, 0 ]
        ];

        tests.forEach(([parser, shouldPass, index], testNo) => {
            const result = not(parser)('', 0)

            assert(result.indexEnd === index, `Index mismatch (${result.indexEnd} vs ${index} @ test # ${testNo})`);

            if (shouldPass) assert(!isError(result), `Expected test pass (test # ${testNo})`)
            else assert(isError(result), `Expected test fail (test # ${testNo})`)

        })
    }
})






export function anyOf<T = string,A extends ParseSource<T> = string>( ...parsers : Parser<T,A>[]) : Parser<T,A> {

    return (source : A, index : number) => {

        const results : ParserError<T,A>[] = [];

        for (const parser of parsers) {
            const result = parser(source, index);
            
            if (! ('error' in result)) return result;
            else results.push(result);
        }

        const err = new SyntaxError("No parser could match the content", {cause: results});

        return {
            source, 
            indexStart: index,
            indexEnd: index, 
            error: err
        }

    }

}

Deno.test({
    name: anyOf.name,
    fn() {

        const failure : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index, error: new Error("Test only") });
        const success : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index + 1, value: undefined });

        const tests : Array<[Parser[],boolean,number]> = [
            [[success, success, success], true, 1],
            [[failure, success, success], true, 1],
            [[success, success, failure], true, 1],
            [[success, failure, success], true, 1],
            [[failure, failure, failure], false, 0],
        ];

        tests.forEach(([parsers, shouldPass, index], testNo) => {
            const result = anyOf(...parsers)('', 0);

            assert(result.indexEnd === index, `Index mismatch (${result.indexEnd} vs ${index} @ test # ${testNo})`);
            
            if (shouldPass) {
                assert(! isError(result), `Expected passing test at index ${index} @ test # ${testNo}`)
            } else {
                assert(isError(result), `Expected failing test at index ${index} @ test # ${testNo}`)
            }
        })

    }
})






export function optional<T = string,A extends ParseSource<T> = string>( parser : Parser<T,A> ) {
    return repeat<T,A>(0, 1, parser);
}





export function zeroOrMore<T = string,A extends ParseSource<T> = string>( parser: Parser<T,A> ) {
    return repeat<T,A>(0, Number.MAX_SAFE_INTEGER, parser);
}





export function oneOrMore<T = string,A extends ParseSource<T> = string>( parser: Parser<T,A> ) {
    return repeat<T,A>(1, Number.MAX_SAFE_INTEGER, parser);
}






export function sequence<BaseType = string, A extends ParseSource<BaseType> = string>( ...parsers : Parser<BaseType, A>[] ) : Parser<BaseType, A> {

    return (source : A, index : number) => {

        const results : ParserResult<BaseType, A>[] = [];
        
        for (let ix = 0; ix < parsers.length; ix++) {
            const parser = parsers[ix];
            const result = parser(source, index);

            if ('error' in result) return result;
            else results.push(result);

            index = result.index;
        }

        return {
            source,
            indexStart: index,
            indexEnd: index,
            value: results
        }

    }

}

Deno.test({
    name: sequence.name,
    fn() {
        const failure : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index, error: new Error("Test only") });
        const success : Parser = (source : string, index : number) => ({ source, indexStart: index, indexEnd: index + 1, value: undefined });

        const tests : Array<[Parser[], boolean, number]> = [
            [[success, success, success], true, 3],
            [[failure, success, success], false, 0],
            [[success, success, failure], false, 2],
            [[success, failure, success], false, 1],
        ];

        tests.forEach(([parsers, shouldPass, index], testNo) => {
            
            const result = sequence(...parsers)('', 0)
            assert(result.indexEnd === index, `Index mismatch (${result.indexEnd} vs ${index} @ test # ${testNo})`);
            
            if (shouldPass) {
                assert(! isError(result), `Expected passing test at index ${index} @ test # ${testNo}`)
            } else {
                assert(isError(result), `Expected failing test at index ${index} @ test # ${testNo}`)
            }
            

        })

    }
})







export function repeat<T = string, A extends ParseSource<T> = string>(minimum = 0, maximum = Number.MAX_SAFE_INTEGER, parser : Parser<T,A>) : Parser<T,A> {

    return (source : A, index : number) => {
        
        let count;
        const results : ParserSuccess<T,A>[] = [];

        let currentIndex = index;
        for (count = 0; count < maximum; count++) {
            const res = parser(source, currentIndex);

            if ('error' in res && count < minimum) {
                // Errored too early
                return res;

            } else if ('error' in res) {
                // Reached the end of our search
                break;

            } else {
                // Found another one!
                results.push(res);
                currentIndex = res.indexEnd;
            }

            if (currentIndex >= source.length) {
                // Exit when we're past the end of the string
                // Important: This is here to avoid infinite loops
                break;
            }

        }

        return {
            source,
            indexStart: index,
            indexEnd: currentIndex,
            value: results
        }

    }

}

Deno.test({
    name: repeat.name,
    fn() {

        let currentIndex = 0;
        let step = 1;

        // Zero or more

        const result = repeat(0,1, (_, index) => {
            assert(currentIndex === index, `Index mismatch detected (${currentIndex} vs ${index})`)
            currentIndex += step;
            return ({ source: '', indexStart: index, indexEnd: currentIndex, value: undefined })
        })('hello world', currentIndex);

        assert(currentIndex === step, `Failed to step forward (${currentIndex} vs ${step})`);
        assert(! isError(result), "No error should be detected");

        // Zero

        const result2 = repeat(0,0, () => {
            assert(false, "Should not have been called.")
        })('hello world', currentIndex)

        assert(! isError(result2), "Incorrectly reported error");

        // One or more
        currentIndex = 0;

        const result3 = repeat(0,3, (_, index) => {
            assert(currentIndex === index, "Index mismatch detected")
            currentIndex += step;
            return ({ source: '', indexStart: index, indexEnd: currentIndex, value: undefined })
        })('hello world', 0);

        assert(currentIndex === (3 * step), "Failed to step forward");
        assert(! isError(result), "No error should be detected");

    }
})








export function token(token : string) : Parser {

    return (source : string, index : number) => {

        let ixSeek = index;
        for (let ixToken = 0; ixToken < token.length; ixToken++, ixSeek++) {
            if (ixSeek >= source.length) {
                return { source, indexStart: index, indexEnd: ixSeek, error: new SyntaxError(`Expected ${token}, got EOF`) }
            } else if (source[ixSeek] !== token[ixToken]) {
                return { source, indexStart: index, indexEnd: ixSeek, error: new SyntaxError(`Expected ${token}, got something else`) }
            }
        }

        return { 
            source, 
            indexStart: index, 
            indexEnd : ixSeek, 
            value: source.substring(index, ixSeek) 
        }

    }

}


Deno.test({
    name: token.name,
    fn() {

        (<Array<[string, string, number, boolean]>><unknown>[
            ['-', '---', 0, true],
            ['=', '-=-', 1, true],
            ['-=', '-=-', 0, true],
            ['-', ' ---', 0, false],
            [' ', '--- ', 0, false],
            ['- ', '--- ', 0, false],
        ]) 
        .forEach(([prefix, source, index, shouldPass]) => {

            const result = token(prefix)(source, index);

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })
    }
})







export function alpha(source : string, index : number) : ParserResult<string, string> {
    const char = source[index];
    
    if (char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z') {
        return {
            source, 
            indexStart: index, 
            indexEnd: index+1, 
            value: char
        }
    
    } else {
        return {
            source, 
            indexStart: index, 
            indexEnd: index, 
            error: new SyntaxError("Expected alphabetic character")
        }
    }
}

Deno.test({
    name: alpha.name,
    fn() {

        const knownCharacters : string [] = [];
        for (let ix = 'a'.charCodeAt(0); ix <= 'z'.charCodeAt(0); ix++) {
            const char = String.fromCharCode(ix);
            knownCharacters.push(char);
            knownCharacters.push(char.toUpperCase());
        }

        const tests : [string,number,boolean][] = [];
        for (let ix = 0; ix < 128; ix++) {
            const char = String.fromCharCode(ix);
            tests.push([char, 0, knownCharacters.includes(char)]);
        }

        tests.forEach(([char, index, shouldPass]) => {
            const result = alpha(char, index)

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })

    }
})






export function numeric(source : string, index : number) : ParserResult<string, string> {
    const char = source[index];

    if (char >= '0' && char <= '9') {
        return {
            source, 
            indexStart: index, 
            indexEnd: index + 1, 
            value: char
        }
    
    } else {
        return {
            source, 
            indexStart: index, 
            indexEnd: index, 
            error: new SyntaxError("Expected numeric character")
        }
    }
}

Deno.test({
    name: numeric.name,
    fn() {

        const knownCharacters : string [] = [];
        for (let ix = '0'.charCodeAt(0); ix <= '9'.charCodeAt(0); ix++) {
            const char = String.fromCharCode(ix);
            knownCharacters.push(char);
        }

        const tests : [string,number,boolean][] = [];
        for (let ix = 0; ix < 128; ix++) {
            const char = String.fromCharCode(ix);
            tests.push([char, 0, knownCharacters.includes(char)]);
        }

        tests.forEach(([char, index, shouldPass]) => {
            const result = numeric(char, index)

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })

    }
})







export function printable(source : string, index: number) : ParserResult<string, string> {
    if ((source.codePointAt(index) || 0) >= 0x20 /* ASCII Printable Start */) {
        return {
            source, indexStart: index, indexEnd: index + 1, value: source[index]
        }
    } else {
        return {
            source, indexStart: index, indexEnd: index, error: new SyntaxError("Expected printable character")
        }
    }
}

Deno.test({
    name: printable.name,
    fn() {

        const knownCharacters : string [] = [];
        for (let ix = 0x20; ix < 128; ix++) {
            const char = String.fromCharCode(ix);
            knownCharacters.push(char);
        }

        const tests : [string,number,boolean][] = [];
        for (let ix = 0; ix < 128; ix++) {
            const char = String.fromCharCode(ix);
            tests.push([char, 0, knownCharacters.includes(char)]);
        }

        tests.forEach(([char, index, shouldPass]) => {
            const result = printable(char, index)

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })

    }
})







export function whitespace(source : string, index : number) : ParserResult<string, string> {

    switch (source[index]) {
        case ASCII.TAB:
        case ASCII.NEWLINE:
        case ASCII.VERTICAL_TAB:
        case ASCII.FORM_FEED:
        case ASCII.CARRIAGE_RETURN:
        case ASCII.SPACE:
            return {
                source, 
                indexStart: index, 
                indexEnd: index + 1, 
                value: source[index]
            };

        default:
            return {
                source, 
                indexStart: index, 
                indexEnd : index, 
                error: new SyntaxError("Expected whitespace")
            }
    
    }
    
}

Deno.test({
    name: whitespace.name,
    fn() {

        const knownCharacters = [ ASCII.TAB, ASCII.NEWLINE, ASCII.VERTICAL_TAB, ASCII.FORM_FEED, ASCII.CARRIAGE_RETURN, ASCII.SPACE ];
        const tests : [string,number,boolean][] = [];

        for (let ix = 0; ix < 127; ix++) {
            const char = String.fromCharCode(ix);
            tests.push([char, 0, knownCharacters.includes(char)]);
        }

        tests.forEach(([char, index, shouldPass]) => {
            const result = whitespace(char, index)

            if (shouldPass) {
                assert(! isError(result), "Unexpected error")
            } else {
                assert(isError(result), "Expected an error to occur")
            }

        })

    }
})



export const newline = anyOf(
    
    // Windows style
    token(ASCII.CARRIAGE_RETURN + ASCII.NEWLINE),
    
    // Mac style
    token(ASCII.CARRIAGE_RETURN),
    
    // Unix style
    token(ASCII.NEWLINE),
);


Deno.test({
    name: 'newline',
    fn() {
        
        const tests : [string,number,boolean][] = 
        [
            [ '\r\n', 2, true ],
            [ '\n', 1, true ],
            [ '\r', 1, true ],
            [ '\t', 0, false ],
            [ 'ê', 0, false ]
        ];

        tests.forEach(([char, index, shouldPass], testNo) => {
            const result = newline(char, 0)

            assert(result.indexEnd === index, `Index mismatch, expected ${index}, got ${result.indexEnd} instead. (test ${testNo})`)

            if (shouldPass) {
                assert(! isError(result), `Unexpected error (test ${testNo})`)
            } else {
                assert(isError(result), `Expected an error to occur (test ${testNo})`)
            }

        })
    }
})



Deno.test({
    name: "Testing Peek Not",
    fn() {

        const tests : Array<[string, boolean, number]> = [
            ["|", false, 0],
            [" ", true, 0]
        ]
        tests.forEach(([source, shouldPass, expectedIndex], testNo) => {
            const result = peek(not(token("|")))(source, 0)
            assert(expectedIndex === result.indexEnd, `${expectedIndex} != ${result.indexEnd}`)
            
            if (shouldPass) assert(! isError(result), `Expected pass (test #${testNo})`)
            else assert(isError(result), `Expected error (test #${testNo})`)
        })
    }
})



export function isError<T = string,A extends ParseSource<T> = string>( result : ParserResult<T,A>) : result is ParserError<T,A> {
    return 'error' in result;
}




export function stringify(parser : Parser) : Parser {
    return intercept(parser, result => {
        
        if ('value' in result) {
            result.value = reduceToString(result)
        }

        return result;
    });
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






export function visualiseSource<T>( pe : ParserResult<T> ) : string {
    
    let ixLineStart = 0;
    let ixLineEnd = 0;

    // Search backwards for line ending
    for (ixLineStart = pe.indexEnd; ixLineStart > 0; ixLineStart--) {
            if (pe.source[ixLineStart] === '\n') {
                ixLineStart++;
                break;
            }
        }

    // Find next line ending
    for (ixLineEnd = pe.indexEnd; ixLineEnd < pe.source.length; ixLineEnd++) {
        if (pe.source[ixLineEnd] === '\n') {
            break;
        }
    }
    
    const sourceLine = pe.source.substring(ixLineStart, ixLineEnd);
    
    // Render the pointy arrow and EOF indicator
    const ixCaret = (pe.indexEnd - ixLineStart);
    const szCaretLine = ''.padStart(ixCaret, "-") + "^";
    
    const ixEof = Math.min(ixLineEnd, pe.source.length) - ixLineStart;
    const eofLine = (ixLineEnd >= pe.source.length) ? ''.padStart(ixEof, ' ') + '| EOF' : '';


    // Find the line and column of the error
    let nLine = 1;
    let nColumn = 1 + (pe.indexEnd - ixLineStart);
    
    for (let ix = pe.indexEnd; ix >= 0; ix--) 
    {
        if ((ix - 1) >= 0 && pe.source[ix - 1] === '\r' && pe.source[ix] === '\n') {
            // Skip this one to avoid double-counting CRLF line endings
            continue;
        }

        if (pe.source[ix] === '\n' || pe.source[ix] === '\r') nLine++;
    }



    // Bring it all together
    return eofLine + '\n' + sourceLine + '\n' + szCaretLine + ` (line ${nLine}, column ${nColumn}, index ${pe.indexEnd})`

}

Deno.test({
    name: visualiseSource.name,
    fn() {

        // Document sample
        const sample = 
String.raw`# Sample
In-between sample line
Document text goes here`;

        assertEquals(
            sample.split('\n').map(s => s.length),
            [ 8, 22, 23 ],
            // "Test sample does not match expected dimensions"
        );

const indexLine = "01234567890123456789 Index"
const colLine = "12345678901234567890 Column"

        // TODO Test various line endings
        // // Simplify line endings
        //     .replaceAll(/(\r\n|\r|\n)/g, '\n')
        //     ;

        const tests : Array<[number, string]> = [
            [ 0, '\n# Sample\n^ (line 1, column 1, index 0)'],
            [ 9 + 8, '\nIn-between sample line\n--------^ (line 2, column 9, index 17)'],
            [ 9 + 23 + 0, '                       | EOF\nDocument text goes here\n^ (line 3, column 1, index 32)'],
        ]

        tests.forEach(([index, expect], testNo) => {
            
            const actual = visualiseSource({ error: new Error(), source: sample, indexStart: index, indexEnd: index })
            assertEquals(actual, expect)

        })

    }
})


function eof<T = string, A extends ParseSource<T> = string>(source : A, index : number ) : ParserResult<T,A> {
    if (index >= source.length) {
        return {
            source, indexStart: index, indexEnd: index, value: undefined
        }
    } else {
        return {
            source, indexStart: index, indexEnd: index, error: new Error('Not end of file')
        }
    }
}