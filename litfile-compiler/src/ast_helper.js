import { parse, print } from "recast";
import { visit, builders as b, NodePath, Path, someField, namedTypes } from "ast-types";


export class ASTHelper {
    get node() {
        if (this.path === null)
            return null;

        return this.path.node;
    }

    get value() {
        if (this.path === null)
            return null;

        return this.path.value;
    }
    
    get importStatements() {
        var imports = this.getAllNodes("ImportDeclaration");

        return imports.map(importAST => {
            const importStatement = importAST.value;

            var source = importStatement.source.value;
            var specifiers = importStatement.specifiers;
            var retSpec = [];

            for (var specifier of specifiers) {
                var localName = specifier.local.name;
                var importedName = localName;

                if (specifier.imported)
                    importedName = specifier.imported.name;

                retSpec.push(new ImportSpecifier(importedName, localName, specifier.type));
            }

            return new ImportStatement(source, retSpec, importStatement.type);
        });
    }

    constructor(root) {
        if (root instanceof NodePath) {
            this.path = root;
        } else if (namedTypes.Node.check(root)) {
            this.path = root.path ? root.path : new NodePath(root, new Path({ root: root }), "root");
        } else if (root instanceof ASTHelper) {
            this.path = root.path;
        } else {
            var ast = parse(root);

            this.path = new NodePath(ast.program);
        }
    }

    getAllNodes(nodeTypes) {
        if (nodeTypes !== null && !(nodeTypes instanceof Array))
            nodeTypes = [nodeTypes];

        var ret = [];

        this.visitNodes(nodeTypes, ast => {
            ret.push(ast);
            return false;
        });

        return ret;
    }

    visitNodes(nodeTypes, callback) {
        if (nodeTypes !== null && !(nodeTypes instanceof Array))
            nodeTypes = [nodeTypes];

        visit(this.path, {
            visitNode(path) {
                if (nodeTypes === null || nodeTypes.includes(path.node.type)) {
                    var callbackRet = callback(new ASTHelper(path));

                    if (callbackRet !== true)
                        return callbackRet;
                }

                this.traverse(path);
            }
        });
    }

    getBreadthFirstNode(nodeTypes, includeSelf) {
        if (nodeTypes === null)
            return null;

        if(includeSelf === undefined)
            includeSelf = true;

        var ret = this.bfVisitNodes(nodeTypes, ast => ast);

        return !ret ? null : ret;
    }

    //Breadth-first visit of nodes
    bfVisitNodes(nodeTypes, callback) {
        if (!(nodeTypes instanceof Array))
            nodeTypes = [nodeTypes];

        var ret = false;
        var queue = [{ val: this.node, name: this.path.name, path: null }];

        while (ret === false && queue.length > 0) {
            var job = queue.shift();
            var working = job.val;
            var path = job.path;

            if (path === null)
                path = this.path;
            else
                path = new NodePath(working, path, job.name);

            someField(working, (name, value) => {
                var isArr = value instanceof Array;
                var isNode = namedTypes.Node.check(value);

                if (!value || (!isArr && !isNode))
                    return false;

                ret = false;

                if (isNode && nodeTypes.includes(value.type)) {
                    value.path = new NodePath(value, path, name);
                    ret = callback(new ASTHelper(value));
                }

                queue.push({ val: value, name: name, path: path });

                return ret;
            });
        }

        return ret;
    }

    setClassMethod(funcName, functionAst, insertMethod) {
        insertMethod = insertMethod || "push";

        this.visitNodes("ClassBody", (ast) => {
            var existingFun = ast.getMethodDefinition(funcName, { kind: functionAst.kind });

            if (existingFun === null){
                var bod = ast.path.get("body");
                
                (insertMethod === "push") ? bod.push(functionAst) : bod.unshift(functionAst);
            }
            else
                existingFun.path.replace(functionAst);

            return false;
        });
    }

    getMethodDefinition(functionName, opts) {
        opts = Object.assign({
            kind: "method",
            static: null
        }, opts);

        var ret = null;

        this.visitNodes("MethodDefinition", ast => {
            if (ast.value.key.name !== functionName)
                return true;

            if (opts.static !== null && ast.value.static !== opts.static)
                return true;

            if (opts.kind !== null && ast.value.kind !== opts.kind)
                return true;

            ret = ast;
            return false;
        });

        return ret;
    }

    getClassDeclaration(className) {
        var ret = null;

        this.visitNodes("ClassDeclaration", ast => {
            if (ast.node.id.name !== className)
                return true;

            ret = ast;
            return false;
        });

        return ret;
    }

    replaceImportStatements(statements) {
        this.visitNodes("ImportDeclaration", ast => {
            ast.path.prune();

            return false;
        });

        this.node.body.unshift(...(statements.map(s => s.toAST())));

        return true;
    }
}

export class ImportSpecifier {
    constructor(imported, local, nodeType) {
        this.imported = imported;
        this.local = local;
        this.nodeType = nodeType;
    }

    toString() {
        if (this.imported === this.local)
            return this.imported;

        return this.imported + " as " + this.local;
    }

    toAST() {
        switch (this.nodeType) {
            case "ImportDefaultSpecifier":
                return b.importDefaultSpecifier(b.identifier(this.local));
            case "ImportSpecifier":
            default:
                return b.importSpecifier(b.identifier(this.imported), this.local === this.imported ? null : b.identifier(this.local));
        }
    }
}

export class ImportStatement {
    constructor(from, specifiers, nodeType) {
        this.from = from;
        this.specifiers = specifiers;
        this.nodeType = nodeType;
    }

    get specifierString() {
        if (this.specifiers.length === 1)
            return this.specifiers[0].toString();

        return `{ ${this.specifiers.map(s => s.toString()).join(", ")} }`
    }

    toString() {
        return `import ${this.specifierString} from ${this.from}`;
    }

    toAST() {
        return b.importDeclaration(
            this.specifiers.map(s => s.toAST()),
            b.literal(this.from)
        );
    }

}

export function makeThisAssignmentAST(variableName, variableAssignment) {
    var expressionAST = new ASTHelper(variableAssignment);
    var exp = expressionAST.getBreadthFirstNode("ExpressionStatement").value.expression;

    return b.expressionStatement(
        b.assignmentExpression(
            "=",
            b.memberExpression(
                b.thisExpression(),
                b.identifier(variableName)
            ),
            exp
        )
    );
}