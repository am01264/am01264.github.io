import {Parser, ParserResult} from "./parser-combinator.ts"

type ruleFn = (result : ParserResult) => ParserResult | Error;

type rule = {
    parser: Parser;
    rule: ruleFn
}

export class RuleEngine {
    
    rules : Array<rule>;
    
    constructor() {
        this.rules = [];
    }

    add( parser: Parser, rule : ruleFn ) {
        this.rules.push({ parser, rule })
    }

    processUntilFirstFail( source : ParserResult ) {

        for (const {parser, rule} of this.rules) {
            if (source.author !== parser) continue;
            
            const res = rule(source);
            if (res instanceof Error) {
                throw res;
            }
        }

    }
}