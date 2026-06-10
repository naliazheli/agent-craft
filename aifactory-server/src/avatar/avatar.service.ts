import { Injectable, Logger } from '@nestjs/common';
import { TosService } from '../tos/tos.service';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(private readonly tosService: TosService) {}

  async generateDefaultAvatar(
    userId: string,
    email: string,
    displayName?: string,
  ): Promise<string> {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return `https://example.test/avatars/${userId}.svg`;
    }

    try {
      // Dynamic import for ESM modules
      const { createAvatar } = await import('@dicebear/core');
      const { identicon, initials, thumbs } = await import('@dicebear/collection');

      const seed = userId;
      
      let avatar;
      if (displayName) {
        avatar = createAvatar(initials, {
          seed,
          size: 256,
          backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
        });
      } else {
        avatar = createAvatar(identicon, {
          seed,
          size: 256,
          backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
        });
      }

      const svgString = avatar.toString();
      const buffer = Buffer.from(svgString, 'utf-8');

      const fileName = `${userId}.svg`;
      const result = await this.tosService.uploadFile(
        fileName,
        buffer,
        'image/svg+xml',
        'public-read' as any,
      );

      this.logger.log(`Generated default avatar for user ${userId}: ${result.url}`);

      return result.url;
    } catch (error) {
      this.logger.error(`Failed to generate default avatar for user ${userId}:`, error);
      throw error;
    }
  }

  async uploadCustomAvatar(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    try {
      const ext = this.getExtensionFromMimeType(mimeType);
      const fileName = `${userId}${ext}`;

      const result = await this.tosService.uploadFile(
        fileName,
        fileBuffer,
        mimeType,
        'public-read' as any,
      );

      this.logger.log(`Uploaded custom avatar for user ${userId}: ${result.url}`);

      return result.url;
    } catch (error) {
      this.logger.error(`Failed to upload custom avatar for user ${userId}:`, error);
      throw error;
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };

    return mimeMap[mimeType] || '.jpg';
  }

  validateImageFile(mimeType: string, size: number): { valid: boolean; error?: string } {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];

    if (!allowedTypes.includes(mimeType)) {
      return {
        valid: false,
        error: 'Invalid file type. Allowed types: JPEG, PNG, GIF, WebP, SVG',
      };
    }

    const maxSize = 5 * 1024 * 1024;
    if (size > maxSize) {
      return {
        valid: false,
        error: 'File size exceeds 5MB limit',
      };
    }

    return { valid: true };
  }
}
