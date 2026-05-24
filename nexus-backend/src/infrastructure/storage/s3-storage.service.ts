import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class S3StorageService implements OnModuleInit {
  private s3Client: S3Client;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(S3StorageService.name)
    private readonly logger: PinoLogger,
  ) {
    this.s3Client = new S3Client({
      endpoint: this.config.s3Endpoint,
      region: this.config.s3Region,
      credentials: {
        accessKeyId: this.config.s3AccessKey,
        secretAccessKey: this.config.s3SecretKey,
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    this.logger.info('Initializing S3/MinIO storage client');
    try {
      await this.ensureBucketExists(this.config.auditArchiveBucket);
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize default audit archive bucket');
    }
  }

  /**
   * Ensures that a bucket exists, creating it if it does not.
   */
  async ensureBucketExists(bucket: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.logger.debug({ bucket }, 'Bucket exists');
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        this.logger.info({ bucket }, 'Bucket does not exist. Creating it...');
        await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.info({ bucket }, 'Bucket created successfully');
      } else {
        this.logger.error({ err, bucket }, 'Error checking bucket existence');
        throw err;
      }
    }
  }

  /**
   * Upload an object to a bucket.
   */
  async putObject(
    bucket: string,
    key: string,
    body: Buffer | string,
    contentType?: string,
  ): Promise<void> {
    await this.ensureBucketExists(bucket);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.info({ bucket, key, size: body.length }, 'Successfully uploaded object to S3');
  }

  /**
   * Checks if an object exists and returns its metadata, or null if not found.
   */
  async headObject(bucket: string, key: string): Promise<{ size: number } | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      return {
        size: response.ContentLength ?? 0,
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Retrieve an object's body as a buffer.
   */
  async getObject(bucket: string, key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error('S3 response body is empty');
    }
    const chunks: any[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
