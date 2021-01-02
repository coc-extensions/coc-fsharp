'use strict';

import {ExtensionContext, ServerOptions, TransportKind, LanguageClientOptions, workspace, LanguageClient, commands, Disposable} from "coc.nvim";
import {ILanguageServerPackages, LanguageServerRepository, LanguageServerProvider, sleep, DotnetResolver} from "coc-utils";
import {TextDocumentIdentifier} from "vscode-languageserver-protocol";
import path from 'path'

const fsac_pkgs: ILanguageServerPackages = {
    "win-x64": {
        executable: "fsautocomplete.dll",
        platformPath: "fsautocomplete.netcore.zip"
    },
    "linux-x64": {
        executable: "fsautocomplete.dll",
        platformPath: "fsautocomplete.netcore.zip"
    },
    "osx-x64": {
        executable: "fsautocomplete.dll",
        platformPath: "fsautocomplete.netcore.zip"
    },
    "linux-arm64": {
        executable: "fsautocomplete.dll",
        platformPath: "fsautocomplete.netcore.zip"
    },
    "osx-arm64": {
        executable: "fsautocomplete.dll",
        platformPath: "fsautocomplete.netcore.zip"
    },
}

const fsac_repo: LanguageServerRepository = {
    kind: "github",
    repo: "fsharp/FsAutoComplete",
    channel: "latest"
}


export default class FSAC {
    private static client: LanguageClient;
    private static clientDisposable: Disposable;

    public static async f1help(): Promise<string|null> {
        if (!FSAC.client.started) {
            return null;
        }
        let cursor = await workspace.getCursorPosition();
        let doc = await workspace.document;
        let id = TextDocumentIdentifier.create(doc.uri);
        let uri = await FSAC.client.sendRequest<any>('fsharp/f1Help', {
            textDocument: id,
            position: cursor
        });
        return JSON.parse(uri.content).Data;
    }

    public static async activate(context: ExtensionContext) {
        // The server is packaged as a .NET core assembly
        const lsprovider = new LanguageServerProvider(context, "FSAC server", fsac_pkgs, fsac_repo)
        const languageServerExe = await lsprovider.getLanguageServer()
        const config = workspace.getConfiguration('FSharp')
        let serverArgs = [languageServerExe, "--background-service-enabled"]

        if (config.get<boolean>("server.trace")) {
          serverArgs.push("--verbose")
          context.logger.info("coc-fsharp: activating verbose logging")
        }

        let dotnet = await DotnetResolver.getDotnetInfo()
        let dotnetRoot = path.join(dotnet.sdksInstalled[0].path, '..')

        let env = Object.assign(process.env, {DOTNET_ROOT: dotnetRoot})
        let serverOptions: ServerOptions = {
            command: "dotnet",
            args: serverArgs,
            options: { env: env, cwd: workspace.cwd },
            transport: TransportKind.stdio
        }

        let server_outputchannel = workspace.createOutputChannel("FSAC")

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for F# documents
            documentSelector: [{scheme: 'file', language: 'fsharp'}],
            synchronize: {
                // Synchronize the setting section 'FSharp' to the server
                configurationSection: 'FSharp',
                // Notify the server about file changes to F# project files contain in the workspace
                fileEvents: [
                    workspace.createFileSystemWatcher('**/*.fsproj'),
                    workspace.createFileSystemWatcher('**/*.fs'),
                    workspace.createFileSystemWatcher('**/*.fsi'),
                    workspace.createFileSystemWatcher('**/*.fsx'),
                    workspace.createFileSystemWatcher('**/project.assets.json')
                ],
            },
            initializationOptions: {
                // setting it to true will start Workspace Loading without need to run fsharp/workspacePeek and fsharp/workspaceLoad commands. 
                // It will always choose top workspace from the found list - all projects in workspace if 0 .sln files are found, .sln file 
                // if 1 .sln file was found, .sln file with most projects if multiple .sln files were found. It's designed to be used in clients 
                // that doesn't allow to create custom UI for selecting workspaces.
                AutomaticWorkspaceInit: true
            },
            outputChannel: server_outputchannel
        }

        // Create the language client and start the client.
        FSAC.client = new LanguageClient('fsharp', 'FsAutoComplete Language Server', serverOptions, clientOptions);
        FSAC.clientDisposable = FSAC.client.start();

        // Push the disposable to the context's subscriptions so that the 
        // client can be deactivated on extension deactivation
        context.subscriptions.push(FSAC.clientDisposable);
        context.subscriptions.push(
            commands.registerCommand('fsharp.downloadLanguageServer', async () => {
                if (FSAC.client.started) {
                    await FSAC.client.stop()
                    FSAC.clientDisposable.dispose()
                    await sleep(1000)
                }
                await lsprovider.downloadLanguageServer();
                FSAC.clientDisposable = FSAC.client.start()
                context.subscriptions.push(FSAC.clientDisposable);
            }),
        );
    }
}
