import { Module, forwardRef } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { AuthModule } from '../auth';
import { UserAvatarController } from './controller';
import {
  UserManagementResolver,
  UserResolver,
  UserSettingsResolver,
} from './resolver';

@Module({
  imports: [StorageModule, PermissionModule, forwardRef(() => AuthModule)],
  providers: [UserResolver, UserManagementResolver, UserSettingsResolver],
  controllers: [UserAvatarController],
})
export class UserModule {}

export { PublicUserType, UserType, WorkspaceUserType } from './types';
