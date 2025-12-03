export function validate(schema) {
    return (req, res, next) => {
      const toValidate = {
        body: req.body,
        query: req.query,
        params: req.params
      };
  
      const { error, value } = schema.validate(toValidate, {
        abortEarly: false,
        allowUnknown: true
      });
  
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message
          })),
          error_code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }
  
      req.validated = value;
      next();
    };
  }
  