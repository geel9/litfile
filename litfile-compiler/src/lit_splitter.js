import cheerio from './cheerio_wrapper.js';
import crypto from 'crypto';

//sue me again
function hash(str) {
    return crypto.createHash('md5').update(str).digest("hex");
}

export class LitSplitter {
    split(document) {
        var ret = new SplitLitfile(hash(document));

        const $ = cheerio.load(document, { decodeEntities: false, xmlMode: true, withStartIndices: true, withEndIndices: true });

        var elementNode = $("element");
        var cssNode = $("style");
        var templateNode = $("template");
        var scriptNode = $("script");

        ret.addPart(this.handlePart("element", elementNode, document));
        ret.addPart(this.handlePart("style", cssNode, document));
        ret.addPart(this.handlePart("template", templateNode, document));
        ret.addPart(this.handlePart("script", scriptNode, document));

        this.parseAbsolutePositions(document, ret);

        return ret;
    }

    handlePart(partName, elem, document) {
        if (!elem || elem.length !== 1)
            return new LitfileSourcePart(partName, "", null, null);

        var position = elem.sourcePosition();
        var contentPosition = elem.sourceContentPosition();
        var attributes = elem.get(0).attribs || {};
        var partHash = "";

        if (position && position.end > position.start) {
            partHash = hash(document.slice(position.start, position.end))
        }

        return new LitfileSourcePart(partName, partHash, attributes, position, contentPosition);
    }

    parseAbsolutePositions(document, ret) {
        var wPositions = [...(ret.getPartsArray().map(p => p.position.start)), ...(ret.getPartsArray().map(p => p.position.end))];
        var cPositions = [...(ret.getPartsArray().map(p => p.contentPosition.start)), ...(ret.getPartsArray().map(p => p.contentPosition.end))];
        var positions = [...wPositions, ...cPositions].filter(p => p !== null).sort((p1, p2) => p1.absolute - p2.absolute);

        const CR = ['\r', '\r'.charCodeAt(0)];
        const LF = ['\n', "\n".charCodeAt(0)];
        const newlines = [...CR, ...LF];

        var indexes = [];

        var numSkippedChars = 0;
        var lineCount = 0;
        var colCount = 0;
        var curChar = null;
        for (var i = 0; i < document.length; i++) {
            var lastChar = curChar;
            curChar = document[i];

            if (!newlines.includes(curChar)) {
                colCount++;
                continue;
            }

            if (LF.includes(curChar) && CR.includes(lastChar)) {
                //Shift the last line forward one to accomodate the extra character in \r\n
                indexes[indexes.length - 1].end++;
                indexes[indexes.length - 1].length++;
                continue;
            }

            indexes.push({
                line: lineCount++,
                start: i - colCount,
                end: i,
                length: colCount,
            });

            colCount = 0;
        }

        if (colCount !== 0)
            indexes.push({
                line: lineCount++,
                start: i - colCount,
                end: i,
                length: colCount
            });


        var posIndex = 0;
        while (indexes.length > 0) {
            var index = indexes.shift();
            for (; posIndex < positions.length && positions[posIndex].absolute <= index.end; posIndex++) {
                var pos = positions[posIndex];

                pos.line = index.line;
                pos.column = pos.absolute - index.start;
            }
        }
    }
}

export class LitfileSourcePart {
    get wholeLength() {
        if (!this.position)
            return 0;

        return this.position.end.absolute - this.position.start.absolute;
    }

    get contentLength() {
        if (!this.contentPosition)
            return 0;

        return this.contentPosition.end.absolute - this.contentPosition.start.absolute;
    }

    constructor(name, partHash, metadata, position, contentPosition) {
        this.name = name;
        this.hash = partHash;
        this.metadata = metadata;
        this.position = position;
        this.contentPosition = contentPosition;
    }

    getWholeText(document) {
        if (this.wholeLength === 0)
            return "";

        return document.slice(this.position.start.absolute, this.position.end.absolute);
    }

    getContentText(document) {
        if (this.contentLength === 0)
            return "";

        return document.slice(this.contentPosition.start.absolute, this.contentPosition.end.absolute);
    }
}

export class SplitLitfile {
    constructor(fileHash) {
        this.error = false; //sue me

        this.fileHash = fileHash;
        this.parts = {};
    }

    getPartForIndex(index) {
        return this.getPartsArray().find((part) => {
            return part.position.start.absolute <= index &&
            part.position.end.absolute >= index;
        });
    }

    hasPart(name) {
        return (name in this.parts);
    }

    getPart(part) {
        if (!this.hasPart(part))
            return null;

        return this.parts[part];
    }

    addPart(part) {
        var name = part.name;

        if (this.hasPart(name))
            return false;

        this.parts[name] = part;
    }

    getPartsArray() {
        return Object.entries(this.parts).map(p => p[1]);
    }
}