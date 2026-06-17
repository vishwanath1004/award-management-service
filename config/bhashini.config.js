const BhashiniConfig = {
  pipelineConfigUrl: process.env.BHASHINI_PIPELINE_CONFIG_URL || "",
  pipelineInferenceUrl: process.env.BHASHINI_PIPELINE_INFERENCE_URL || "",
  authorizationKey: process.env.BHASHINI_AUTHORIZATION_KEY || "",
  serviceId: process.env.BHASHINI_SERVICE_ID || "",
  targetLanguage: process.env.BHASHINI_TARGET_LANGUAGE || "en",
  batchSize: Math.max(
    1,
    Number.parseInt(process.env.BHASHINI_BATCH_SIZE || "10", 10) || 10
  ),
};

export default BhashiniConfig;
