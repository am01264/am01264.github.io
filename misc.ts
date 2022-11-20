import {Parser, ParserResult} from "./parser-combinator.ts"

type ruleFn = (result : ParserResult) => ParserResult | Error;

type rule = {
    parser: Parser;
    rule: ruleFn
}

export class RuleEngine {
    
    mRules: Map<Parser, ruleFn[]>;

    constructor() {
        this.mRules = new Map();
    }

    add( parser: Parser, rule : ruleFn ) {
        
        const newRuleFns = this.mRules.get(parser) || [];
        newRuleFns.push(rule);
        
        this.mRules.set(parser, newRuleFns)

    }

    processUntilFirstFail( source : ParserResult ) {

        const parser = source.author;
        const rules = this.mRules.get(parser) || [];

        for (const fnRule of rules) {
            const res = fnRule(source);

            if (res instanceof Error) {
                return new TypeError("Rule failed to run.", {cause: res});
            }
        }

        return source;

    }
}