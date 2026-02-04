/**
 * Input Validation Middleware
 * 
 * Uses Joi to validate request bodies and query parameters
 * Prevents malformed data from reaching the database
 */

const Joi = require('joi');

/**
 * Validation schemas for API endpoints
 */
const schemas = {
  // Push token registration
  pushTokenRegister: Joi.object({
    expo_push_token: Joi.string()
      .pattern(/^ExponentPushToken\[.+\]$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid Expo push token format',
        'any.required': 'expo_push_token is required'
      }),
    platform: Joi.string()
      .valid('ios', 'android')
      .required()
      .messages({
        'any.only': 'platform must be ios or android',
        'any.required': 'platform is required'
      }),
    app_version: Joi.string()
      .max(20)
      .optional(),
    user_id: Joi.string()
      .uuid()
      .optional()
      .allow(null),
    device_id: Joi.string()
      .max(100)
      .optional()
      .allow(null),
  }).or('user_id', 'device_id').messages({
    'object.missing': 'Either user_id or device_id is required'
  }),

  // Push token deletion
  pushTokenDelete: Joi.object({
    expo_push_token: Joi.string()
      .pattern(/^ExponentPushToken\[.+\]$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid Expo push token format',
        'any.required': 'expo_push_token is required'
      }),
  }),

  // Price alerts sync
  priceAlertsSync: Joi.object({
    alerts: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().required(),
          metal: Joi.string()
            .valid('gold', 'silver', 'platinum', 'palladium')
            .required(),
          target_price: Joi.number()
            .positive()
            .max(1000000)
            .required(),
          direction: Joi.string()
            .valid('above', 'below')
            .required(),
          enabled: Joi.boolean()
            .optional()
            .default(true),
        })
      )
      .required()
      .messages({
        'array.base': 'alerts must be an array',
        'any.required': 'alerts array is required'
      }),
    user_id: Joi.string()
      .uuid()
      .optional()
      .allow(null),
    device_id: Joi.string()
      .max(100)
      .optional()
      .allow(null),
  }).or('user_id', 'device_id').messages({
    'object.missing': 'Either user_id or device_id is required'
  }),

  // Price alert deletion
  priceAlertDelete: Joi.object({
    alert_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'alert_id must be a valid UUID',
        'any.required': 'alert_id is required'
      }),
  }),

  // Receipt scan (optional - already has multer validation)
  receiptScan: Joi.object({
    image: Joi.string()
      .optional(),
    mimeType: Joi.string()
      .valid('image/jpeg', 'image/png', 'image/webp', 'image/heic')
      .optional(),
    originalSize: Joi.number()
      .optional(),
  }),
};

/**
 * Middleware factory for validating request bodies
 * 
 * @param {string} schemaName - Name of the schema to use
 * @param {string} location - Location to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
function validate(schemaName, location = 'body') {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      console.error(`Validation schema not found: ${schemaName}`);
      return next(); // Don't block if schema is missing
    }

    const dataToValidate = req[location];
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just first
      stripUnknown: true, // Remove unknown keys
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      console.warn(`Validation failed for ${schemaName}:`, errors);

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace request data with validated/sanitized data
    req[location] = value;
    next();
  };
}

/**
 * Validate query parameters
 */
function validateQuery(schemaName) {
  return validate(schemaName, 'query');
}

/**
 * Validate route parameters
 */
function validateParams(schemaName) {
  return validate(schemaName, 'params');
}

module.exports = {
  validate,
  validateQuery,
  validateParams,
  schemas,
};
