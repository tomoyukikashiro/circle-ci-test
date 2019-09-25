const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const cloudfront = require('gulp-cloudfront-invalidate-aws-publish');
const parallelize = require('concurrent-transform');
const merge = require('merge-stream');
const isStaging = process.env.NODE_ENV === 'staging'

const AWS_BUCKET_NAME = isStaging ? process.env.STG_AWS_BUCKET_NAME : process.env.AWS_BUCKET_NAME
const AWS_ACCESS_KEY_ID = isStaging ? process.env.STG_AWS_ACCESS_KEY_ID : process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = isStaging ? process.env.STG_AWS_SECRET_ACCESS_KEY : process.env.AWS_SECRET_ACCESS_KEY
const AWS_CLOUDFRONT = isStaging ? process.env.STG_AWS_CLOUDFRONT : process.env.AWS_CLOUDFRONT
const AWS_DEFAULT_REGION = isStaging ? process.env.STG_AWS_DEFAULT_REGION : process.env.AWS_DEFAULT_REGION

console.log(AWS_BUCKET_NAME)

// https://docs.aws.amazon.com/cli/latest/userguide/cli-environment.html
const config = {

  // 必須
  params: {
    Bucket: AWS_BUCKET_NAME
  },
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    signatureVersion: 'v3'
  },

  distribution: AWS_CLOUDFRONT, // CloudFront distribution ID
  region: AWS_DEFAULT_REGION,

  // 適切なデフォルト値 - これらのファイル及びディレクトリは gitignore されている
  distDir: 'dist',
  indexRootPath: true,
  // cacheFileName: '.awspublish',
  concurrentUploads: 10,
  wait: true,  // CloudFront のキャッシュ削除が完了するまでの時間（約30〜60秒）
}

const target = {
  noCache: {
    src: [`./${config.distDir}/favicon.ico`, `./${config.distDir}/static/**`, `./${config.distDir}/**/*.html`],
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' }
  },
  cache: {
    src: `./${config.distDir}/_nuxt/**`,
    headers: { 'Cache-Control': 'public, max-age=31536000' }
  } ,
}


gulp.task('deploy', function() {
  // S3 オプションを使用して新しい publisher を作成する
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
  const publisher = awspublish.create(config);

  var gulpNoCache = gulp.src(target.noCache.src, { base: config.distDir });
  gulpNoCache = gulpNoCache.pipe(parallelize(publisher.publish(target.noCache.headers), config.concurrentUploads))

  var gulpCache = gulp.src(target.cache.src, { base: config.distDir });
  gulpCache = gulpCache.pipe(parallelize(publisher.publish(target.cache.headers), config.concurrentUploads))

  var g = merge(gulpNoCache, gulpCache);

  // CDN のキャッシュを削除する
  if (config.distribution) {
    console.log('Configured with CloudFront distribution');
    g = g.pipe(cloudfront(config));
  } else {
    console.log('No CloudFront distribution configured - skipping CDN invalidation');
  }

  // 削除したファイルを同期する
  if (isStaging) g = g.pipe(publisher.sync());
  // アップロードの更新をコンソールに出力する
  g = g.pipe(awspublish.reporter());
  return g;
});
