//Stolen from https://github.com/cheeriojs/cheerio/issues/866
//This fixes encoded entities due to javascript dependency hell


//encoded dependencies are bad for litfiles

import cheerio from 'cheerio';
import parseExports from 'cheerio/lib/parse';
import { Parser } from 'htmlparser2';
import { DomHandler } from 'domhandler';

const load = cheerio.load;
const evaluate = parseExports.evaluate;

function decode(string) {
    return string.replace(/&#x([0-9a-f]{1,6});/ig, (entity, code) => {
        code = parseInt(code, 16);

        // Don't unescape ASCII characters, assuming they're encoded for a good reason
        if (code < 0x80) return entity;

        return String.fromCodePoint(code);
    });
}

function wrapHtml(fn) {
    return function () {
        const result = fn.apply(this, arguments);
        return typeof result === 'string' ? decode(result) : result;
    };
}

function pos(start, end) {
    return {
        start: {
            absolute: start,
            line: null,
            column: null
        },
        end: {
            absolute: end,
            line: null,
            column: null
        },
    }
}

//Returns min(children.startIndex) as start, max(children.endIndex) as end.
function getSourceContentPosition(instance) {
    return function () {
        if (this.length === 0)
            return { start: 0, end: 0 };

        var elements = this.get(0).children || [];
        if (elements.length === 0)
            return { start: 0, end: 0 };

        return pos(
            Math.min(...(elements.map(e => e.startIndex))),
            Math.max(...(elements.map(e => e.endIndex)))
        );
    };
}

function getSourcePosition(instance) {
    return function () {
        if (this.length === 0)
            return { start: 0, end: 0 };

        var elm = this.get(0);

        return pos(elm.startIndex, elm.endIndex);
    };
}

cheerio.load = function () {
    const instance = load.apply(this, arguments);

    instance.html = wrapHtml(instance.html);
    instance.prototype.html = wrapHtml(instance.prototype.html);

    instance.sourcePosition = getSourcePosition(instance);
    instance.prototype.sourcePosition = getSourcePosition(instance);

    instance.sourceContentPosition = getSourceContentPosition(instance);
    instance.prototype.sourceContentPosition = getSourceContentPosition(instance);

    return instance;
};

//We need to overwrite cheerio's evaluate function because we need to use a custom DomHandler
//This is so we can _actually_ pass the correct indice-related options to DomHandler.
//We need these options so we can know the exact positions of each litfile "DOM" element (script/template/element/style) in the .lit file.

parseExports.evaluate = function (content, options) {
    // options = options || $.fn.options;

    var dom;

    if (typeof content === 'string' || Buffer.isBuffer(content)) {
        const handler = options.handler ? options.handler : new DomHandler(void 0, options);
        var parser = new Parser(handler, options);
        parser.parseComplete(content);
        return handler.dom;
    } else {
        dom = content;
    }

    return dom;
}

export default cheerio;