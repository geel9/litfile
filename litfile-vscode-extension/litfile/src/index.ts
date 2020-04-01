import * as vscode from 'vscode';
import { LitfileProvider } from './provider';


export function activate(context: vscode.ExtensionContext) {
    const provider = new LitfileProvider();

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider("litfile", provider)
    );

    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand("litfile.preview", async (editor, edit) => {
            var uri = editor.document.uri.with({ scheme: "litfile", path: editor.document.uri.path.replace(".lit", ".lit.js") });
            vscode.window.showTextDocument(uri, {preview: false})
        })
    );
}




