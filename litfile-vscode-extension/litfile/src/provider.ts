import * as vscode from 'vscode';
import { compile } from 'litfile-compiler';

export class LitfileProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
        var filePath = vscode.Uri.file(uri.path.replace(".lit.js", ".lit"));

        return vscode.workspace.openTextDocument(filePath).then(doc => {
            var text = doc.getText();

            var compiled = compile(text);

            return compiled.code;
        });
    }
}
