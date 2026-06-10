import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  canActivate(context: ExecutionContext) {
    if (!process.env.GITHUB_CLIENT_ID?.trim() || !process.env.GITHUB_CLIENT_SECRET?.trim()) {
      throw new ServiceUnavailableException('GitHub OAuth is not configured.');
    }

    return super.canActivate(context);
  }
}
