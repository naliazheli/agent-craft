import { TosService } from './tos.service';

export async function tosBasicExample(tosService: TosService) {
  try {
    const fileBuffer = Buffer.from('Hello, Volcengine TOS!');
    const fileName = `example-${Date.now()}.txt`;

    const uploadResult = await tosService.uploadFile(
      fileName,
      fileBuffer,
      'text/plain',
    );
    console.log('Upload result:', uploadResult);

    const exists = await tosService.fileExists(uploadResult.key);
    console.log('File exists:', exists);

    const metadata = await tosService.getFileMetadata(uploadResult.key);
    console.log('File metadata:', metadata);

    const downloadedBuffer = await tosService.downloadFile(uploadResult.key);
    console.log('Downloaded content:', downloadedBuffer.toString());

    const publicUrl = tosService.getPublicUrl(uploadResult.key);
    console.log('Public URL:', publicUrl);

    await tosService.deleteFile(uploadResult.key);
    console.log('File deleted successfully');

    const existsAfterDelete = await tosService.fileExists(uploadResult.key);
    console.log('File exists after delete:', existsAfterDelete);
  } catch (error) {
    console.error('TOS operation failed:', error);
  }
}

export async function tosPreSignedUrlExample(tosService: TosService) {
  try {
    const fileName = `presigned-example-${Date.now()}.txt`;
    const key = `temp/${fileName}`;

    console.log('\n=== Pre-Signed Upload URL Example ===');
    const uploadUrl = tosService.getPreSignedUploadUrl(key, 3600);
    console.log('Pre-signed upload URL:', uploadUrl);
    console.log('Use this URL with PUT request to upload file');
    console.log('Example: axios.put(uploadUrl, fileContent)');

    console.log('\n=== Pre-Signed Download URL Example ===');
    const downloadUrl = tosService.getPreSignedDownloadUrl(key, 3600);
    console.log('Pre-signed download URL:', downloadUrl);
    console.log('Use this URL with GET request or paste in browser to download');
    console.log('Example: axios.get(downloadUrl)');

    console.log('\n=== Pre-Signed Delete URL Example ===');
    const deleteUrl = tosService.getPreSignedDeleteUrl(key, 3600);
    console.log('Pre-signed delete URL:', deleteUrl);
    console.log('Use this URL with DELETE request to delete file');
    console.log('Example: axios.delete(deleteUrl)');

    console.log('\n=== Generic Pre-Signed URL Example ===');
    const headUrl = tosService.getPreSignedUrl(key, 'HEAD', 1800);
    console.log('Pre-signed HEAD URL:', headUrl);
    console.log('Use this URL to get file metadata');
  } catch (error) {
    console.error('Pre-signed URL generation failed:', error);
  }
}

export async function tosPostSignatureExample(tosService: TosService) {
  try {
    const fileName = `post-upload-${Date.now()}.txt`;

    console.log('\n=== POST Form Signature Example ===');
    const signature = await tosService.getPostSignature(fileName, 3600);
    console.log('POST form signature data:', signature);
    console.log('\nUse this signature data in HTML form:');
    console.log(`
<form action="https://your-bucket.tos-cn-beijing.volces.com" method="post" enctype="multipart/form-data">
  <input type="hidden" name="key" value="temp/${fileName}" />
  <input type="hidden" name="policy" value="${signature.policy}" />
  <input type="hidden" name="x-tos-algorithm" value="${signature.algorithm}" />
  <input type="hidden" name="x-tos-credential" value="${signature.credential}" />
  <input type="hidden" name="x-tos-date" value="${signature.date}" />
  <input type="hidden" name="x-tos-signature" value="${signature.signature}" />
  <input type="file" name="file" />
  <button type="submit">Upload</button>
</form>
    `);
  } catch (error) {
    console.error('POST signature generation failed:', error);
  }
}

export async function tosCompleteExample(tosService: TosService) {
  console.log('=== TOS Service Complete Examples ===\n');
  
  await tosBasicExample(tosService);
  await tosPreSignedUrlExample(tosService);
  await tosPostSignatureExample(tosService);
  
  console.log('\n=== All examples completed ===');
}
