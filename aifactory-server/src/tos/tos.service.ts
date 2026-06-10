import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TosClient, TosClientError, TosServerError, ACLType } from '@volcengine/tos-sdk';
import { Readable } from 'stream';

@Injectable()
export class TosService {
  private readonly logger = new Logger(TosService.name);
  private readonly client: TosClient;
  private readonly bucket: string;
  private readonly folder: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('TOS_ACCESS_KEY') || '';
    const accessKeySecret = this.configService.get<string>('TOS_SECRET_KEY') || '';
    const region = this.configService.get<string>('TOS_REGION') || 'cn-beijing';
    const endpoint = this.configService.get<string>('TOS_ENDPOINT') || '';

    this.bucket = this.configService.get<string>('TOS_BUCKET') || '';
    this.folder = this.configService.get<string>('TOS_FOLDER') || '';
    this.publicUrl = this.configService.get<string>('TOS_PUBLIC_URL') || '';

    if (!accessKeyId || !accessKeySecret || !this.bucket) {
      this.logger.warn('TOS credentials not configured. Avatar uploads will fail.');
    }

    this.client = new TosClient({
      accessKeyId,
      accessKeySecret,
      region,
      endpoint,
      maxRetryCount: 3,
    });

    this.logger.log(`TOS client initialized for bucket: ${this.bucket}, region: ${region}`);
  }

  private handleError(error: unknown): never {
    if (error instanceof TosClientError) {
      this.logger.error('TOS Client Error:', error.message);
      this.logger.error('Stack:', error.stack);
      throw new Error(`TOS Client Error: ${error.message}`);
    } else if (error instanceof TosServerError) {
      this.logger.error('TOS Server Error:', {
        requestId: error.requestId,
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      });
      throw new Error(`TOS Server Error: ${error.message}`);
    } else {
      this.logger.error('Unexpected TOS error:', error);
      throw new Error('Unexpected TOS error occurred');
    }
  }

  async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    contentType?: string,
    acl?: ACLType,
  ): Promise<{ key: string; url: string; size: number }> {
    try {
      const key = this.folder ? `${this.folder}/${fileName}` : fileName;

      await this.client.putObject({
        bucket: this.bucket,
        key,
        body: fileBuffer,
        contentType,
        acl: acl as any,
      });

      const { data } = await this.client.headObject({
        bucket: this.bucket,
        key,
      });

      const size = parseInt(data['content-length'] || '0', 10);
      const url = this.publicUrl
        ? `${this.publicUrl}/${key}`
        : `https://${this.bucket}.${this.configService.get('TOS_ENDPOINT')}/${key}`;

      this.logger.log(`File uploaded successfully: ${key} (${size} bytes)`);

      return { key, url, size };
    } catch (error) {
      this.handleError(error);
    }
  }

  async uploadStream(
    fileName: string,
    stream: Readable,
    contentType?: string,
  ): Promise<{ key: string; url: string }> {
    try {
      const key = this.folder ? `${this.folder}/${fileName}` : fileName;

      await this.client.putObject({
        bucket: this.bucket,
        key,
        body: stream,
        contentType,
      });

      const url = this.publicUrl
        ? `${this.publicUrl}/${key}`
        : `https://${this.bucket}.${this.configService.get('TOS_ENDPOINT')}/${key}`;

      this.logger.log(`Stream uploaded successfully: ${key}`);

      return { key, url };
    } catch (error) {
      this.handleError(error);
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const {
        data: { content },
      } = await this.client.getObjectV2({
        bucket: this.bucket,
        key,
      });

      let allContent = Buffer.from([]);
      for await (const chunk of content) {
        allContent = Buffer.concat([allContent, Buffer.from(chunk)]);
      }

      this.logger.log(`File downloaded successfully: ${key} (${allContent.length} bytes)`);

      return allContent;
    } catch (error) {
      this.handleError(error);
    }
  }

  async downloadStream(key: string): Promise<Readable> {
    try {
      const {
        data: { content },
      } = await this.client.getObjectV2({
        bucket: this.bucket,
        key,
      });

      this.logger.log(`Stream downloaded successfully: ${key}`);

      return content as unknown as Readable;
    } catch (error) {
      this.handleError(error);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.deleteObject({
        bucket: this.bucket,
        key,
      });

      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.handleError(error);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.headObject({
        bucket: this.bucket,
        key,
      });
      return true;
    } catch (error) {
      if (error instanceof TosServerError && error.statusCode === 404) {
        return false;
      }
      this.handleError(error);
    }
  }

  async getFileMetadata(key: string): Promise<{
    size: number;
    contentType: string;
    lastModified: Date;
  }> {
    try {
      const { data } = await this.client.headObject({
        bucket: this.bucket,
        key,
      });

      return {
        size: parseInt(data['content-length'] || '0', 10),
        contentType: (data['content-type'] as string) || 'application/octet-stream',
        lastModified: new Date(data['last-modified'] || Date.now()),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucket}.${this.configService.get('TOS_ENDPOINT')}/${key}`;
  }

  getPreSignedUrl(
    key: string,
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE' = 'GET',
    expiresIn: number = 3600,
  ): string {
    try {
      const url = this.client.getPreSignedUrl({
        method: method as 'GET' | 'PUT',
        bucket: this.bucket,
        key,
        expires: expiresIn,
      });

      this.logger.log(`Generated pre-signed URL for ${method} ${key} (expires in ${expiresIn}s)`);

      return url;
    } catch (error) {
      this.handleError(error);
    }
  }

  getPreSignedDownloadUrl(key: string, expiresIn: number = 3600): string {
    return this.getPreSignedUrl(key, 'GET', expiresIn);
  }

  getPreSignedUploadUrl(key: string, expiresIn: number = 3600): string {
    return this.getPreSignedUrl(key, 'PUT', expiresIn);
  }

  getPreSignedDeleteUrl(key: string, expiresIn: number = 3600): string {
    return this.getPreSignedUrl(key, 'DELETE', expiresIn);
  }

  async getPostSignature(
    fileName: string,
    expiresIn: number = 3600,
    conditions?: Array<any>,
  ): Promise<Record<string, any>> {
    try {
      const key = this.folder ? `${this.folder}/${fileName}` : fileName;

      const res = await this.client.preSignedPostSignature({
        bucket: this.bucket,
        key,
        expiresIn,
        conditions,
      });

      this.logger.log(`Generated POST form signature for ${key} (expires in ${expiresIn}s)`);

      return res as Record<string, any>;
    } catch (error) {
      this.handleError(error);
    }
  }
}
