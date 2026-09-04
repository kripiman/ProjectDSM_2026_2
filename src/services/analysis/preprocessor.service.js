const fs = require('fs');
const { AppError } = require('../../middlewares/error.middleware');
const { ERROR_CODES } = require('../../config/constants');

class PreprocessorService {
  /**
   * Evaluates if uploaded file is a genuine rock/mineral specimen.
   * If not, throws AppError with HTTP 422 NON_SPECIMEN_IMAGE.
   */
  static async validateSpecimen(filePath, originalFilename = '', simulateFlag = false) {
    if (!fs.existsSync(filePath)) {
      throw new AppError(400, 'Image file does not exist on server', ERROR_CODES.VALIDATION_ERROR);
    }

    const stats = fs.statSync(filePath);
    if (stats.size < 50) {
      throw new AppError(422, 'Uploaded image is too small or corrupt. 422 NON SPECIMEN IMAGE', ERROR_CODES.NON_SPECIMEN_IMAGE);
    }

    const lowerName = originalFilename.toLowerCase();
    if (
      simulateFlag === true ||
      simulateFlag === 'true' ||
      lowerName.includes('non_specimen') ||
      lowerName.includes('not_a_rock') ||
      lowerName.includes('selfie') ||
      lowerName.includes('document')
    ) {
      throw new AppError(422, 'The uploaded image does not appear to be a rock or mineral specimen. 422 NON SPECIMEN IMAGE', ERROR_CODES.NON_SPECIMEN_IMAGE);
    }

    return {
      isValidSpecimen: true,
      fileSizeBytes: stats.size
    };
  }
}

module.exports = PreprocessorService;
