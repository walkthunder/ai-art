/**
 * 小程序静态资源 OSS URL 映射
 * 自动生成，请勿手动修改
 * 生成时间: 2026-02-05T10:59:56.858Z
 */

const OSS_ASSETS = {
  "bg-corners/bottom-left.png": "https://wms.webinfra.cloud/miniprogram-assets/bg-corners/bottom-left.png",
  "bg-corners/bottom-right.png": "https://wms.webinfra.cloud/miniprogram-assets/bg-corners/bottom-right.png",
  "bg-corners/top-left.png": "https://wms.webinfra.cloud/miniprogram-assets/bg-corners/top-left.png",
  "bg-corners/top-right.png": "https://wms.webinfra.cloud/miniprogram-assets/bg-corners/top-right.png",
  "common-bg.jpg": "https://wms.webinfra.cloud/miniprogram-assets/common-bg.jpg",
  "lantern.png": "https://wms.webinfra.cloud/miniprogram-assets/lantern.png",
  "preview-after.jpg": "https://wms.webinfra.cloud/miniprogram-assets/preview-after.jpg",
  "preview-before.jpg": "https://wms.webinfra.cloud/miniprogram-assets/preview-before.jpg",
  "wealth-icon.png": "https://wms.webinfra.cloud/miniprogram-assets/wealth-icon.png",
  "camera-upload.png": "https://wms.webinfra.cloud/miniprogram-assets/camera-upload.png?v=1738713600",
  "templates/transform/classical-palace.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/classical-palace.jpg?v=20260202",
  "templates/transform/fHPym5Te7.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/fHPym5Te7.jpg",
  "templates/transform/fHPyN0b67.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/fHPyN0b67.jpg",
  "templates/transform/fHPyoUXXv.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/fHPyoUXXv.jpg",
  "templates/transform/luxury-chinese.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/luxury-chinese.jpg?v=20260202",
  "templates/transform/luxury-european.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/luxury-european.jpg?v=20260202",
  "templates/transform/modern-luxury.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/modern-luxury.jpg?v=20260202",
  "templates/puzzle/time-family.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/time-family.jpg",
  "templates/puzzle/years-song.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/years-song.jpg",
  "templates/puzzle/spring-reunion.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/spring-reunion.jpg",
  "templates/puzzle/mid-autumn.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/mid-autumn.jpg",
  "templates/puzzle/modern-simple.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/modern-simple.jpg",
  "templates/puzzle/vintage.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/puzzle/vintage.jpg",
  "templates/transform/fugui-tuanyuan.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/fugui-tuanyuan.jpg?v=20260202",
  "templates/transform/haomen-shengyan.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/haomen-shengyan.jpg?v=20260202",
  "templates/transform/yazhi-jusuo.jpg": "https://wms.webinfra.cloud/miniprogram-assets/templates/transform/yazhi-jusuo.jpg?v=20260202",
  "bg/upload-bg.png": "https://wms.webinfra.cloud/miniprogram-assets/bg/upload-bg.png?v=1738713600",
  "logo/logo-1024.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-1024.png",
  "logo/logo-120.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-120.png",
  "logo/logo-180.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-180.png",
  "logo/logo-512.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-512.png",
  "logo/logo-96.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-96.png",
  "logo/logo-header.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-header.png",
  "logo/logo-small.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/logo-small.png",
  "logo/share-icon.png": "https://wms.webinfra.cloud/miniprogram-assets/logo/share-icon.png",
  "bg/button-bg.png": "https://wms.webinfra.cloud/miniprogram-assets/bg/button-bg.png",
  "bg/puzzle-bg.jpg": "https://wms.webinfra.cloud/miniprogram-assets/bg/puzzle-bg.jpg",
  "picture-frame.png": "https://wms.webinfra.cloud/miniprogram-assets/picture-frame.png?v=1738714400",
  "bg/puzzle-upload-bg.jpg": "https://wms.webinfra.cloud/miniprogram-assets/bg/puzzle-upload-bg.jpg?v=1738747749",
  "puzzle-upload.png": "https://wms.webinfra.cloud/miniprogram-assets/puzzle-upload.png?v=1738748400",
  "bg/puzzle-result-bg.jpg": "https://wms.webinfra.cloud/miniprogram-assets/bg/puzzle-result-bg.jpg?v=1738750000"
};

/**
 * 获取 OSS 资源 URL
 * @param {string} localPath - 本地相对路径，如 'images/launch-bg.png'
 * @returns {string} OSS URL
 */
function getAssetUrl(localPath) {
  return OSS_ASSETS[localPath] || '/assets/' + localPath;
}

module.exports = {
  OSS_ASSETS,
  getAssetUrl,
};
