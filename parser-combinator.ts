import {assert} from "https://deno.land/std@0.144.0/testing/asserts.ts"

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

interface ParserError {
    source: string;
    index: number;
    error: Error;
}

interface ParserSuccess<T> {
    source: string;
    index: number;
    value: T;
}

export type ParserResult<T> = ParserSuccess<T> | ParserError;

export type Parser<T> = (source : string, index : number) => ParserResult<T>





export function intercept<T>( parser : Parser<T>, cb : (result : ParserResult<T>) => any ) {

    return (source : string, index : number) => {
        const result = parser(source, index);
        const response = cb(result);

        if (response) return response;
        else return result;
    }


}






export function peek<T>( parser : Parser<T>, offset = 0 ) {
    return (source : string, index : number) => {
        // Push the index forward
        const result = parser(source, index + offset);

        // Rewind the index
        result.index = index;
        return result;
    }
}

Deno.test({
    name: peek.name,
    fn() {
        const failure : Parser<any> = (source : string, index : number) => ({ source, index, error: new Error("Test only") });
        const success : Parser<any> = (source : string, index : number) => ({ source, index: index + 1, value: null });

        const test : Array<[Parser<any>,boolean,number]> = [
            [failure, false, 0],
            [success, true, 0]
        ];

        test.forEach(([parser, shouldPass, index], testNo) => {
            const result = peek(parser)('', 0);
            assert(result.index === index, `Index mismatch (${result.index} vs ${index} @ test # ${testNo})`);

            if (shouldPass) assert(!isError(result), `Expected test pass (test # ${testNo})`)
            else assert(isError(result), `Expected test fail (test # ${testNo})`)            
        })

    }
})






export function not<T>( parser : Parser<T> ) : Parser<string> {
    return (source : string, index : number) => {
        const res = parser(source, index);

        if ('error' in res) {
            return { 
                source, 
                index : res.index + 1, 
                value: source.substring(index, res.index + 1) 
            };
        } else {
            return { 
                source, 
                index, 
                error: new SyntaxError("Token not allowed") 
            };
        }
    }
}


Deno.test({
    name: not.name,
    fn() {
        const failure : Parser<any> = (source : string, index : number) => ({ source, index, error: new Error("Test only") });
        const success : Parser<any> = (source : string, index : number) => ({ source, index: index + 1, value: null });

        const tests : Array<[Parser<any>, boolean, number]> = [
            [ failure, true, 1 ],
            [ success, false, 0 ]
        ];

        tests.forEach(([parser, shouldPass, index], testNo) => {
            const result = not(parser)('', 0)

            assert(result.index === index, `Index mismatch (${result.index} vs ${index} @ test # ${testNo})`);

            if (shouldPass) assert(!isError(result), `Expected test pass (test # ${testNo})`)
            else assert(isError(result), `Expected test fail (test # ${testNo})`)

        })
    }
})






export function anyOf( ...parsers : Parser<any>[]) : Parser<any> {

    return (source : string, index : number) => {

        const results = [];

        for (const parser of parsers) {
            const result = parser(source, index);
            
            if (! ('error' in result)) return result;
            else results.push(result);
        }

        const err = new SyntaxError("No parser could match the content");

        return {
            source, index, error: err, failures: results
        }

    }

}

Deno.test({
    name: anyOf.name,
    fn() {

        const failure : Parser<any> = (source : string, index : number) => ({ source, index, error: new Error("Test only") });
        const success : Parser<any> = (source : string, index : number) => ({ source, index: index + 1, value: null });

        const tests : Array<[Parser<any>[],boolean,number]> = [
            [[success, success, success], true, 1],
            [[failure, success, success], true, 1],
            [[success, success, failure], true, 1],
            [[success, failure, success], true, 1],
            [[failure, failure, failure], false, 0],
        ];

        tests.forEach(([parsers, shouldPass, index], testNo) => {
            const result = anyOf(...parsers)('', 0);

            assert(result.index === index, `Index mismatch (${result.index} vs ${index} @ test # ${testNo})`);
            
            if (shouldPass) {
                assert(! isError(result), `Expected passing test at index ${index} @ test # ${testNo}`)
            } else {
                assert(isError(result), `Expected failing test at index ${index} @ test # ${testNo}`)
            }
        })

    }
})






export function optional<T>( parser : Parser<T> ) : Parser<T[]> {
    return repeat(0, 1, parser);
}





export function zeroOrMore( parser: Parser<any> ) : Parser<any> {
    return repeat(0, Number.MAX_SAFE_INTEGER, parser);
}







export function sequence<T extends readonly any[]>( ...parsers : T ) : Parser<any> {

    return (source : string, index : number) => {

        const results : ParserResult<T>[] = [];
        
        for (let ix = 0; ix < parsers.length; ix++) {
            const parser = parsers[ix];
            const result = parser(source, index);

            if ('error' in result) return result;
            else results.push(result);

            index = result.index;
        }

        return {
            source,
            index,
            value: results
        }

    }

}

Deno.test({
    name: sequence.name,
    fn() {
        const failure : Parser<any> = (source : string, index : number) => ({ source, index, error: new Error("Test only") });
        const success : Parser<any> = (source : string, index : number) => ({ source, index: index + 1, value: null });

        const tests = [
            [[success, success, success], true, 3],
            [[failure, success, success], false, 0],
            [[success, success, failure], false, 2],
            [[success, failure, success], false, 1],
        ];

        tests.forEach(([parsers, shouldPass, index], testNo) => {
            
            const result = sequence(...parsers)('', 0)
            assert(result.index === index, `Index mismatch (${result.index} vs ${index} @ test # ${testNo})`);
            
            if (shouldPass) {
                assert(! isError(result), `Expected passing test at index ${index} @ test # ${testNo}`)
            } else {
                assert(isError(result), `Expected failing test at index ${index} @ test # ${testNo}`)
            }
            

        })

    }
})







export function repeat<T>(minimum = 0, maximum = Number.MAX_SAFE_INTEGER, parser : Parser<T>) : Parser<any[]> {

    return (source : string, index : number) => {
        
        let count;
        const results : ParserSuccess<T>[] = [];

        for (count = 0; count < maximum; count++) {
            const res = parser(source, index);

            if ('error' in res && count < minimum) {
                // Errored too early
                return res;

            } else if ('error' in res) {
                // Reached the end of our search
                break;

            } else {
                // Found another one!
                results.push(res);
                index = res.index;
            }

        }

        return {
            source,
            index,
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
            return ({ source: '', index: currentIndex, value: undefined })
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
            return ({ source: '', index: currentIndex, value: undefined })
        })('hello world', 0);

        assert(currentIndex === (3 * step), "Failed to step forward");
        assert(! isError(result), "No error should be detected");

    }
})








export function token(token : string) : Parser<string> {

    return (source : string, index : number) => {

        let ixSeek = index;
        for (let ixToken = 0; ixToken < token.length; ixToken++, ixSeek++) {
            if (ixSeek >= source.length) {
                return <ParserError>{ source, index: ixSeek, error: new SyntaxError(`Expected ${token}, got EOF`) }
            } else if (source[ixSeek] !== token[ixToken]) {
                return <ParserError>{ source, index: ixSeek, error: new SyntaxError(`Expected ${token}, got something else`) }
            }
        }

        return <ParserSuccess<string>>{ source, index : ixSeek, value: source.substring(index, ixSeek) }

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







export function alpha(source : string, index : number) : ParserResult<string> {
    const char = source[index];
    
    if (char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z') {
        return {
            source, index: index+1, value: char
        }
    
    } else {
        return {
            source, index, error: new SyntaxError("Expected alphabetic character")
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






export function numeric(source : string, index : number) {
    const char = source[index];

    if (char >= '0' && char <= '9') {
        return {
            source, index: index + 1, value: char
        }
    
    } else {
        return {
            source, index, error: new SyntaxError("Expected numeric character")
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







export function printable(source : string, index: number) {
    if ((source.codePointAt(index) || 0) >= 0x20 /* ASCII Printable Start */) {
        return {
            source, index: index + 1, value: source[index]
        }
    } else {
        return {
            source, index, error: new SyntaxError("Expected printable character")
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







export function whitespace(source : string, index : number) : ParserResult<string> {

    switch (source[index]) {
        case ASCII.TAB:
        case ASCII.NEWLINE:
        case ASCII.VERTICAL_TAB:
        case ASCII.FORM_FEED:
        case ASCII.CARRIAGE_RETURN:
        case ASCII.SPACE:
            return {
                source, index: index + 1, value: source[index]
            };

        default:
            return {
                source, index, error: new SyntaxError("Expected whitespace")
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

            assert(result.index === index, `Index mismatch, expected ${index}, got ${result.index} instead. (test ${testNo})`)

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
            assert(expectedIndex === result.index, `${expectedIndex} != ${result.index}`)
            
            if (shouldPass) assert(! isError(result), `Expected pass (test #${testNo})`)
            else assert(isError(result), `Expected error (test #${testNo})`)
        })
    }
})



export function isError<T>( result : ParserResult<T>) {
    return 'error' in result;
}