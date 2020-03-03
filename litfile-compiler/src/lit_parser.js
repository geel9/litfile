const cheerio = require("cheerio");

export default class LitParser {
    construct() {
        this.properties = [];
        this.element = {
            name: null,
            type: null,
            base: "LitElement"
        };
        this.css = {
            lang: "css",
            contents: null
        };
        this.js = null;
        this.templateString = null;
    }

    parse(document) {
        const $ = cheerio.load(document);

        var elementNode = $("element");
        var cssNode = $("style");
        var templateNode = $("template");
        var scriptNode = $("script");

        var element = this.parseElement(elementNode, $);
        var properties = this.parseProperties(elementNode, $);
        var css = this.parseCSS(cssNode);
        var template = this.parseTemplate(templateNode);
        var script = this.parseScript(scriptNode);

        return {
            element: element,
            properties: properties,
            css: css,
            template: template,
            script: script
        };
    }

    parseElement(element, $) {
        if (element.length !== 1)
            return null;

        var name = element.attr("name");
        var type = element.attr("type");
        var baseType = element.attr("base");

        return {
            name: name,
            type: type,
            base: (typeof (baseType) === 'undefined' ? "LitElement" : baseType)
        }
    }

    parseProperties(element, $) {
        var propertyElems = element.find("property");

        return propertyElems.toArray().map(p => this.parseProperty($(p)));
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

    parseCSS(css) {
        if (css.length !== 1)
            return null;

        var lang = css.attr("lang");
        if (typeof (lang) === 'undefined')
            lang = "css";

        return {
            lang: lang,
            contents: css.html()
        };
    }

    parseTemplate(template) {
        if (!template)
            return null;

        return template.html();
    }

    parseScript(script) {
        if (!script)
            return null;

        return script.html();
    }
}