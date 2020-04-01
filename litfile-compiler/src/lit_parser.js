import cheerio from './cheerio_wrapper.js';
import { SplitLitfile } from './lit_splitter.js';

function dom(document) {
    return cheerio.load(document, { decodeEntities: false, withStartIndices: true, withEndIndices: true, recognizeSelfClosing: true });
}

export class LitParser {
    parse(split, document) {
        var ret = new ParsedLitfile(split);

        this.parseElement(ret, document);
        this.parseCSS(ret, document);
        this.parseTemplate(ret, document);
        this.parseScript(ret, document);

        return ret;
    }

    parseElement(ret, document) {
        var elemPart = ret.source.getPart("element");

        if (!elemPart)
            return;

        var elementHTML = elemPart.getWholeText(document);
        const $ = dom(elementHTML);
        var elementNode = $("element");
        var propertyNodes = $(elementNode).find("prop, property");

        var name = elementNode.attr("name");
        var type = elementNode.attr("type");
        var baseType = elementNode.attr("base");

        var properties = propertyNodes.toArray().map(p => this.parseProperty($(p)));

        var partData = {
            name: name,
            type: type,
            base: (typeof (baseType) === 'undefined' ? "LitElement" : baseType),
            properties: properties
        };

        ret.addPart(new LitfileParsedPart("element", partData, elemPart));
    }

    parseProperty(property) {
        var name = property.attr("name");
        var type = property.attr("type");
        if (typeof (type) === 'undefined')
            type = 'String';

        var reflect = property.attr("reflect");
        reflect = (typeof (reflect) !== 'undefined') && reflect !== "false"

        var attribute = property.attr("attribute");

        if (attribute === "false")
            attribute = false;

        var defaultValue = property.attr("default");

        var ret = {
            name: name,
            type: type,
            reflect: reflect,
            default: defaultValue
        };

        if (typeof (attribute) !== "undefined")
            ret.attribute = attribute;

        return ret;
    }

    parseCSS(ret, document) {
        var cssPart = ret.source.getPart("style");

        if (!cssPart)
            return;

        var lang = cssPart.metadata.lang || "css";
        var contents = cssPart.getContentText(document);

        var partData = {
            lang: lang,
            contents: contents
        };

        ret.addPart(new LitfileParsedPart("style", partData, cssPart));
    }

    parseTemplate(ret, document) {
        var templatePart = ret.source.getPart("template");

        if (!templatePart)
            return;

        var lang = templatePart.metadata.lang || "lithtml";
        var contents = templatePart.getContentText(document);

        var partData = {
            lang: lang,
            contents: contents
        };

        ret.addPart(new LitfileParsedPart("template", partData, templatePart));
    }

    parseScript(ret, document) {
        var jsPart = ret.source.getPart("script");

        if (!jsPart)
            return;

        var lang = jsPart.metadata.lang || "javascript";
        var contents = jsPart.getContentText(document);

        var partData = {
            lang: lang,
            contents: contents
        };

        ret.addPart(new LitfileParsedPart("script", partData, jsPart));
    }
}

export class ParsedLitfile extends SplitLitfile {
    constructor(splitSource) {
        super(splitSource.hash);
        this.source = splitSource;
    }

    get elementName() {
        return this.getPart("element").value.name;
    }

    get elementBaseType() {
        return this.getPart("element").value.base || "LitElement";
    }

    get elementType() {
        return this.getPart("element").value.type;
    }

    get elementProperties() {
        return this.getPart("element").value.properties;
    }
}

export class LitfileParsedPart {
    constructor(name, data, sourcePart) {
        this.name = name;
        this.value = data;
        this.source = sourcePart;
    }
}