import type { YarnWorkspaceItem } from '@affine-tools/utils/types';
import { AliasToPackage } from '@affine-tools/utils/distribution';
import { Workspace, type PackageName } from '@affine-tools/utils/workspace';
import { Cli } from 'clipanion';

import { BuildCommand } from './build';
import { CleanCommand } from './clean';
import type { CliContext } from './context';
import { DevCommand } from './dev';
import { InitCommand } from './init';
import { RunCommand } from './run';

const packageList: YarnWorkspaceItem[] = [
  { name: '@validate/web', location: 'apps/web', workspaceDependencies: [] },
  { name: '@validate/server', location: 'apps/server', workspaceDependencies: [] },
];

AliasToPackage.set('server', '@validate/server' as unknown as PackageName);

class ValidateDevCommand extends DevCommand {
  protected override availablePackages: PackageName[] = [
    '@validate/web',
    '@validate/server',
  ] as unknown as PackageName[];
}

const cli = new Cli<CliContext>({
  binaryName: 'validate',
  binaryVersion: '0.0.0',
  binaryLabel: 'Validate Monorepo Tools',
  enableColors: true,
  enableCapture: true,
});

cli.register(RunCommand);
cli.register(InitCommand);
cli.register(CleanCommand);
cli.register(BuildCommand);
cli.register(ValidateDevCommand);

await cli.runExit(process.argv.slice(2), {
  workspace: new Workspace(packageList as any),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
