import * as qiniu from 'qiniu';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

// 生成上传凭证
function generateUploadToken(): string {
  const accessKey = process.env.Qiniu_AccessKey;
  const secretKey = process.env.Qiniu_SecretKey;
  const bucket = process.env.Qiniu_BUCKET;

  if (!accessKey || !secretKey || !bucket) {
    throw new Error('七牛云配置不完整，请检查环境变量');
  }

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const options = {
    scope: bucket,
    expires: 3600, // 1小时过期
  };
  const putPolicy = new qiniu.rs.PutPolicy(options);
  return putPolicy.uploadToken(mac);
}

// 上传文件到七牛云
export async function uploadToQiniu(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const bucket = process.env.Qiniu_BUCKET;
  const url = process.env.Qiniu_URL;

  if (!bucket || !url) {
    throw new Error('七牛云配置不完整，请检查环境变量');
  }

  const fileSizeKB = (buffer.length / 1024).toFixed(2);
  console.log(`[七牛云上传] 开始上传: ${fileName} (${fileSizeKB} KB)`);

  const uploadToken = generateUploadToken();
  const config = new qiniu.conf.Config();
  const formUploader = new qiniu.form_up.FormUploader(config);
  const putExtra = new qiniu.form_up.PutExtra();

  return new Promise((resolve, reject) => {
    formUploader.put(
      uploadToken,
      fileName,
      buffer,
      putExtra,
      (respErr, respBody, respInfo) => {
        if (respErr) {
          console.error(`[七牛云上传] 上传失败: ${fileName}`, respErr.message);
          reject(respErr);
          return;
        }

        if (respInfo.statusCode === 200) {
          // 返回完整的图片 URL
          const imageUrl = `${url}/${respBody.key}`;
          console.log(`[七牛云上传] 上传成功: ${imageUrl}`);
          resolve(imageUrl);
        } else {
          const errorMsg = `上传失败: ${respInfo.statusCode} - ${JSON.stringify(respBody)}`;
          console.error(`[七牛云上传] ${fileName}: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      }
    );
  });
}

// 压缩图片
async function compressImage(buffer: Buffer, contentType?: string): Promise<Buffer> {
  const maxSizeKB = 500; // 500KB
  const originalSizeKB = buffer.length / 1024;
  
  // 如果图片已经小于 500KB，直接返回
  if (originalSizeKB <= maxSizeKB) {
    console.log(`[图片压缩] 图片已小于 500KB，跳过压缩: ${originalSizeKB.toFixed(2)} KB`);
    return buffer;
  }

  try {
    let compressedBuffer = buffer;
    let quality = 85;
    let currentSizeKB = originalSizeKB;

    // 使用 sharp 压缩图片
    const contentTypeLower = contentType?.toLowerCase() || '';
    const isJpeg = contentTypeLower.includes('jpeg') || contentTypeLower.includes('jpg');
    const isPng = contentTypeLower.includes('png');
    const isWebp = contentTypeLower.includes('webp');
    const isGif = contentTypeLower.includes('gif');

    // GIF 格式不压缩（sharp 对 GIF 支持有限）
    if (isGif) {
      console.log(`[图片压缩] GIF 格式跳过压缩: ${originalSizeKB.toFixed(2)} KB`);
      return buffer;
    }

    // 逐步降低质量直到达到目标大小
    while (currentSizeKB > maxSizeKB && quality > 30) {
      const sharpInstance = sharp(buffer).resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      if (isJpeg) {
        compressedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } else if (isPng) {
        compressedBuffer = await sharpInstance
          .png({ quality, compressionLevel: 9 })
          .toBuffer();
      } else if (isWebp) {
        compressedBuffer = await sharpInstance
          .webp({ quality })
          .toBuffer();
      } else {
        // 其他格式转换为 JPEG
        compressedBuffer = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      }

      currentSizeKB = compressedBuffer.length / 1024;
      
      if (currentSizeKB > maxSizeKB && quality > 30) {
        quality -= 10;
      } else {
        break;
      }
    }

    const compressedSizeKB = compressedBuffer.length / 1024;
    console.log(`[图片压缩] ${originalSizeKB.toFixed(2)} KB -> ${compressedSizeKB.toFixed(2)} KB (质量: ${quality})`);
    
    return compressedBuffer;
  } catch (error: any) {
    console.error('[图片压缩] 压缩失败，使用原图:', error.message);
    return buffer;
  }
}

// 上传图片到七牛云（自动生成文件名）
export async function uploadImageToQiniu(
  buffer: Buffer,
  userId: string,
  contentType?: string
): Promise<string> {
  // 压缩图片
  const compressedBuffer = await compressImage(buffer, contentType);
  
  // 根据 content type 确定文件扩展名
  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
  };

  const extension =
    (contentType && extensionMap[contentType.toLowerCase()]) || 'jpg';
  const fileName = `images/${userId}/${Date.now()}-${uuidv4()}.${extension}`;

  return uploadToQiniu(compressedBuffer, fileName);
}

