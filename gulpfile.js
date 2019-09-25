const gulp = require('gulp');
const awspublish = require('gulp-awspublish');
const cloudfront = require('gulp-cloudfront-invalidate-aws-publish');
const parallelize = require('concurrent-transform');
const merge = require('merge-stream');

// https://docs.aws.amazon.com/cli/latest/userguide/cli-environment.html
const config = {

  // 必須
  params: {
    Bucket: process.env.AWS_BUCKET_NAME
  },
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    signatureVersion: 'v3'
  },

  distribution: process.env.AWS_CLOUDFRONT, // CloudFront distribution ID
  region: process.env.AWS_DEFAULT_REGION,

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
  if (process.env.NODE_ENV !== 'production') g = g.pipe(publisher.sync());
  // アップロードの更新をコンソールに出力する
  g = g.pipe(awspublish.reporter());
  return g;
});
