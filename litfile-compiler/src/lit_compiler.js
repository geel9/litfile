import { parse, print } from "recast";
import { builders as b } from "ast-types";
import { ASTHelper, ImportSpecifier, ImportStatement, makeThisAssignmentAST } from "./ast_helper";

export default class LitCompiler {
    get defaultCSS() {
        return "";
    }

    //todo: Move these to a ParsedLitfile class or something
    getBaseClass(parsed) {
        if (!parsed.element || !parsed.element.base)
            return "LitElement";

        return parsed.element.base;
    }

    getDefaultClassDeclaration(parsed) {
        return `export default class ${parsed.element.type} extends ${this.getBaseClass(parsed)} {
        }`;
    }

    getDefaultJS(parsed) {
        return this.getDefaultClassDeclaration(parsed);
    }

    get defaultTemplate() {
        return "<div class='default-litfile-template'></div>";
    }

    /**
     * 
     * @param {*} parsed The result from LitParser.parse(document)
     */
    compile(parsed) {
        var js = parsed.script ? parsed.script : this.getDefaultJS(parsed);

        const ast = new ASTHelper(parse(js).program);

        this.ensureClass(ast, parsed);
        this.injectConstructor(ast, parsed);
        this.compileImports(ast, parsed);
        this.injectCSS(ast, parsed);
        this.injectRender(ast, parsed);
        this.injectProperties(ast, parsed);
        this.fixExports(ast, parsed);
        this.registerElement(ast, parsed);

        return print(ast.node);
    }

    /**
     * Ensure that the element class is declared and extends the proper base
     * 
     * @param {ASTHelper} ast T
     * @param {*} parsed The result from LitParser.parse(document)
     */
    ensureClass(ast, parsed) {
        var elemClass = ast.getClassDeclaration(parsed.element.type);

        if (!elemClass) {
            elemClass = new ASTHelper(this.getDefaultClassDeclaration(parsed)).getBreadthFirstNode("ExportDefaultDeclaration");
            ast.node.body.push(elemClass.node);
            return;
        }

        var expectedBase = this.getBaseClass(parsed);
        var baseClass = elemClass.path.get("superClass");

        if (!baseClass.value || expectedBase !== baseClass.value.name)
            baseClass.replace(b.identifier(expectedBase));
    }

    /**
     * Ensure that customElements.define is called 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    registerElement(ast, parsed) {
        var elemName = parsed.element.name;
        var elemType = parsed.element.type;

        var isDefined = false;


        //Visit breadth-first because the call to register is VERY likely going to be 
        var functionCalls = ast.bfVisitNodes("CallExpression", (ast) => {
            var calledClass = ast.getBreadthFirstNode("MemberExpression");

            if (!calledClass || calledClass.node.object.name !== "customElements")
                return false;

            var args = ast.path.get("arguments").value;
            var elemnNameArg = args[0].value;
            var elemTypeArg = args[1].name;

            if (elemnNameArg === elemName && elemTypeArg === elemType) {
                isDefined = true;
                return true;
            }
        });

        if (isDefined)
            return;

        //Insert the function ourselves
        ast.node.body.push(
            b.expressionStatement(
                b.callExpression(
                    b.memberExpression(
                        b.identifier("customElements"),
                        b.identifier("define")
                    ),
                    [
                        b.literal(elemName),
                        b.identifier(elemType)
                    ]
                )
            )
        );
    }

    /**
     * Ensure that the requisite imports from LitElement are included.
     * 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    compileImports(ast, parsed) {
        var imports = ast.importStatements;

        var mustHave = ["css", "html", "LitElement"].map(s => new ImportSpecifier(s, s, "ImportSpecifier"));
        var newImport = new ImportStatement("lit-element", mustHave, "ImportDeclaration");

        var changed = false;

        for (var imported of imports) {
            if (imported.from !== "lit-element")
                continue;

            var have = imported.specifiers.map(s => s.imported);
            newImport.specifiers = mustHave.filter(f => !have.includes(f.imported));

            for (var insert of newImport.specifiers) {
                imported.specifiers.push(insert);
                changed = true;
            }

            //We're not importing only one part
            for (var specifier of imported.specifiers) {
                if (specifier.nodeType === "ImportDefaultSpecifier")
                    specifier.nodeType = "ImportSpecifier";
            }

            break;
        }

        if (!changed && newImport.specifiers.length > 0) {
            imports.push(newImport);
            changed = true;
        }

        if (changed)
            ast.replaceImportStatements(imports);
    }

    /**
     * Inject the stylesheet from the <style> tag into the generated class.
     * 
     * Replaces the return value of an existing `statuc get styles()` function.
     * 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    injectCSS(ast, parsed) {
        if (!parsed.css)
            return;

        var templateStr = `css\`${parsed.css.contents}\``;
        var templateAst = parse(templateStr).program.body[0];

        //Create a class so we can parse a "static get" method, and then replace its return statement.
        //Sorry.
        var str = `
        class a { 
            static get styles() {
                return null; 
            } 
        }`;

        var funcAst = (new ASTHelper(str));
        funcAst = funcAst.getMethodDefinition("styles", { kind: "get" });

        if (funcAst) {
            funcAst.visitNodes("ReturnStatement", retAst => {
                retAst.path.get("argument").replace(templateAst.expression);

                return true;
            });
        }

        var elemClass = ast.getClassDeclaration(parsed.element.type);
        elemClass.setClassMethod("styles", funcAst.node, "unshift");
    }

    /**
     * Inject the script from <template> (if it exists) and insert it into render()
     * 
     * If <template> is provided, it will ALWAYS overwrite the render() function.
     * If <template> is not provided, render() MUST be defined in your class in the .lit's <script> 
     * 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    injectRender(ast, parsed) {
        var template = (parsed.template) ? parsed.template : this.defaultTemplate;
        var literalStr = `html\`${template}\``;
        var literalAST = new ASTHelper(literalStr).getBreadthFirstNode("ExpressionStatement").node.expression;

        var elemClass = ast.getClassDeclaration(parsed.element.type);
        var renderMethod = ast.getMethodDefinition("render");

        //Don't override render() if the user specified it and didn't provide a <template/>
        if (renderMethod !== null && !parsed.templateString)
            return;

        //Build the method manually and return the HTML AST
        var funcAst = b.methodDefinition(
            "method",
            b.identifier("render"),
            b.functionExpression(
                b.identifier("wat"),
                [],
                b.blockStatement([
                    b.returnStatement(
                        literalAST
                    )
                ])
            )
        );

        elemClass.setClassMethod("render", funcAst);
    }

    /**
     * Inject the <property> elements (if they exist) into the constructor() and `get static properties()` methods
     * 
     * 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    injectProperties(ast, parsed) {
        var elemClass = ast.getClassDeclaration(parsed.element.type);
        var constructor = ast.getMethodDefinition("constructor", { kind: "constructor" });
        var propertiesGetter = ast.getMethodDefinition("properties", { kind: "get", static: true });

        if (propertiesGetter !== null)
            return;

        var assignments = parsed.properties.map(this.createPropertyGetterAST);

        var funcAst = b.methodDefinition(
            "get",
            b.identifier("properties"),
            b.functionExpression(
                null,
                [],
                b.blockStatement([
                    b.returnStatement(
                        b.objectExpression(
                            assignments
                        )
                    )
                ])
            ),
            true
        );

        elemClass.setClassMethod("properties", funcAst, "unshift");
    }

    /**
     * Build the constructor. This is responsible for:
     * 
     * -Calling super()
     * -Initializing default property values
     * -Renaming user-defined constructor() and calling it at the end of constructor()
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    injectConstructor(ast, parsed) {
        var elemClass = ast.getClassDeclaration(parsed.element.type);
        var constructor = ast.getMethodDefinition("constructor", { kind: "constructor" });

        var assignments = parsed.properties.map(this.createPropertyConstructorAST);

        if (constructor !== null) {
            constructor.node.kind = "method";
            constructor.node.key.name = "constructor_litfile_replaced";

            var superCall = constructor.getBreadthFirstNode("Super");

            if (superCall)
                superCall.path.parentPath.prune();

            assignments.push(
                b.expressionStatement(
                    b.callExpression(
                        b.memberExpression(
                            b.thisExpression(),
                            b.identifier("constructor_litfile_replaced")
                        ),
                        []
                    ),
                )
            );
        }

        //Build the method manually and return the HTML AST
        var funcAst = b.methodDefinition(
            "constructor",
            b.identifier("constructor"),
            b.functionExpression(
                b.identifier("wat"),
                [],
                b.blockStatement([
                    b.expressionStatement(
                        b.callExpression(
                            b.super(), []
                        ),
                    ),
                    ...assignments
                ])
            )
        );

        elemClass.setClassMethod("constructor", funcAst, "unshift");
    }

    /**
     * Create an AST that represents a basic `this.foo = bar;` call.
     * @param {*} property 
     */
    createPropertyConstructorAST(property) {
        var defaultVal = property.default;

        if (property.type === "String")
            defaultVal = `"${defaultVal}"`;

        return makeThisAssignmentAST(property.name, defaultVal);
    }

    /**
     * Creates an AST that represents a property in the object returned by `properties()`
     * 
     * This represents the `key: { value }` for a property, where key is the name of a top-level property defined in the class
     * @param {*} property 
     */
    createPropertyGetterAST(property) {
        var keys = {
            type: property.type,
        };

        if (property.reflect)
            keys.reflect = true;

        if (typeof (property.attribute) !== "undefined") {
            var attr = property.attribute;
            if (typeof (attr) !== "boolean")
                attr = `"${attr}"`;


            keys.attribute = `${attr}`;
        }

        var propertyAssigns = [];
        for (var entry of Object.entries(keys)) {
            var ast = new ASTHelper(entry[1]);

            var assign = b.property(
                "init",
                b.identifier(entry[0]),
                ast.getBreadthFirstNode("ExpressionStatement").node.expression
            );

            propertyAssigns.push(assign);
        }

        return b.property(
            "init",
            b.identifier(property.name),
            b.objectExpression(
                propertyAssigns
            )
        );
    }

    /**
     * Ensures that the class is exported by name, and forces it to be the default export if there are no other exports.
     * 
     * @param {ASTHelper} ast 
     * @param {*} parsed 
     */
    fixExports(ast, parsed) {
        var elemClass = ast.getClassDeclaration(parsed.element.type);
        var exports = ast.getAllNodes(["ExportDeclaration", "ExportDefaultDeclaration", "ExportNamedDeclaration"]);
        var defaultExport = ast.getBreadthFirstNode("ExportDefaultDeclaration");

        var exportingClass = false;

        for (var exported of exports) {
            if (!exported.node.declaration)
                continue;

            if (exported.node.declaration.id.name !== parsed.element.type)
                continue;

            exportingClass = true;

            //If there is no default export, and this class isn't default exported, change it to the default export.
            if (exported.node.type !== "ExportDefaultDeclaration" && !defaultExport) {
                exported.path.replace(
                    b.exportDefaultDeclaration(
                        elemClass.node
                    )
                );
            }
        }

        if (!exportingClass) {
            elemClass.path.replace(
                b.exportDeclaration(!defaultExport, elemClass.node)
            );
        }
    }
}