import { Injectable } from '@nestjs/common';
import { TosService } from '../tos/tos.service';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class StorageService {
  constructor(private readonly tosService: TosService) {}

  async upload(
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    const ext = path.extname(file.originalname);
    const fileName = `uploads/${randomUUID()}${ext}`;

    const result = await this.tosService.uploadFile(
      fileName,
      file.buffer,
      file.mimetype,
      'public-read' as any,
    );

    return { url: result.url, key: result.key };
  }
}
