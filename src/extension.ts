/* Copyright (c) Ben Robert Mewburn 
 * Licensed under the ISC Licence.
 */
'use strict';

import * as path from 'path';
import * as fs from 'fs-extra';
import * as semver from 'semver';

import {
	workspace, Disposable, ExtensionContext, Uri, TextDocument, languages,
	IndentAction, window, commands, TextEditor, TextEditorEdit, TextEdit,
	Range, Position, CancellationToken, CancellationTokenSource
} from 'vscode';
import {
	LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions,
	TransportKind, TextDocumentItem, DocumentFormattingRequest,
	DocumentRangeFormattingRequest
} from 'vscode-languageclient';
import {initializeEmbeddedContentDocuments} from './embeddedContentDocuments';

const phpLanguageId = 'php';
const version = '0.8.5';

let maxFileSizeBytes = 10000000;
let languageClient: LanguageClient;
let extensionContext:ExtensionContext;
let cancelWorkspaceDiscoveryController:CancellationTokenSource;

export function activate(context: ExtensionContext) {

	extensionContext = context;
	let versionMemento = context.workspaceState.get<string>('version');
	let clearCache = context.workspaceState.get<boolean>('clearCache');
	context.workspaceState.update('clearCache', undefined);
	context.workspaceState.update('version', version);
	
	if(!versionMemento || (semver.lt(versionMemento, '0.8.2'))) {
		clearCache = true;
	}

	// The server is implemented in node
	let module = context.asAbsolutePath(path.join('node_modules', 'intelephense', 'lib', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6039"] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: module, runtime: "node", transport: TransportKind.ipc },
		debug: { module: module, runtime: "node", transport: TransportKind.ipc, options: debugOptions }
	}

	let middleware = initializeEmbeddedContentDocuments(() => {
		return languageClient;
	});

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ language: phpLanguageId, scheme: 'file' },
		],
		synchronize: {
			// Synchronize the setting section 'intelephense' to the server
			configurationSection: 'intelephense',
		},
		initializationOptions: {
			storagePath:context.storagePath,
			clearCache:clearCache
		},
		middleware:middleware.middleware
	}

	// Create the language client and start the client.
	languageClient = new LanguageClient('intelephense', 'intelephense', serverOptions, clientOptions);
	let langClientDisposable = languageClient.start();
	let ready = languageClient.onReady();

	ready.then(() => {
		languageClient.info('Intelephense ' + version);
	});

	//push disposables
	context.subscriptions.push(langClientDisposable);

}

function importCommandHandler(textEditor: TextEditor, edit: TextEditorEdit) {
	let inputPromise = window.showInputBox({ placeHolder: 'Enter an alias (optional)' });
	inputPromise.then((text) => {
		return languageClient.sendRequest<TextEdit[]>(
			'importSymbol',
			{ uri: textEditor.document.uri.toString(), position: textEditor.selection.active, alias: text }
		);
	}).then((edits) => {
		textEditor.edit((eb) => {
			edits.forEach((e) => {
				eb.replace(
					new Range(new Position(e.range.start.line, e.range.start.character), new Position(e.range.end.line, e.range.end.character)),
					e.newText
				);
			});
		});
	});
}

function clearCacheCommandHandler() {
	return extensionContext.workspaceState.update('clearCache', true).then(()=>{
		commands.executeCommand('workbench.action.reloadWindow');
	});
}
