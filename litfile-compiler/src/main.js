import LitParser from './lit_parser.js';
import LitCompiler from './lit_compiler.js';

export function compile(litfile) {
    var parser = new LitParser();
    var compiler = new LitCompiler();

    return compiler.compile(parser.parse(litfile));
}