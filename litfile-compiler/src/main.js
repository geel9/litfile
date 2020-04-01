import { LitParser } from './lit_parser.js';
import { LitCompiler } from './lit_compiler.js';
import { LitSplitter } from './lit_splitter.js';

function compile(litfile) {
    var splitter = new LitSplitter();
    var parser = new LitParser();
    var compiler = new LitCompiler();

    var splitResult = splitter.split(litfile);
    var parseResult = parser.parse(splitResult, litfile);
    var compileResult = compiler.compile(parseResult);

    return compileResult;
}


export {
    LitSplitter, LitParser, LitCompiler,
    compile
};