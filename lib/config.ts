export const config = {
  limits: {
    maxImages: 5,
    maxTotalSize: 4 * 1024 * 1024, // 4MB
    maxIndividualSize: 2 * 1024 * 1024, // 2MB per file
    maxPdfPages: 5,
  },
  timeout: {
    requestTimeout: 60000, // 60 seconds
  },
  features: {
    enablePdfConversion: true,
    enableImageUpload: true,
    enableDragDrop: true,
  }
};
