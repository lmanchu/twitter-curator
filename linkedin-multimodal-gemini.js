#!/usr/bin/env node

/**
 * LinkedIn Multimodal Content Generator
 * 使用 Gemini 2.5 Pro 分析圖片並生成配文
 *
 * Gemini Pro 付費版優勢:
 * - 2M token context
 * - 多模態支援 (圖片+文字)
 * - 更高品質輸出
 */

const fs = require('fs');
const path = require('path');
const geminiClient = require('../Iris/scripts/lib/gemini-client');

/**
 * 從圖片生成 LinkedIn 貼文
 * @param {string} imagePath - 圖片路徑
 * @param {string} topic - 主題 (optional)
 * @param {object} context - 額外context
 * @returns {Promise<object>} 生成的內容
 */
async function generatePostFromImage(imagePath, topic = '', context = {}) {
  try {
    // 讀取圖片
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    // 判斷 MIME type
    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    // 構建 prompt
    const prompt = `You are Lman, a tech entrepreneur and AI expert. Analyze this image and create a professional LinkedIn post.

${topic ? `Topic focus: ${topic}` : ''}

Guidelines:
1. Analyze what's in the image (tech demo, product screenshot, diagram, etc.)
2. Create an insightful LinkedIn post (Traditional Chinese or English based on content)
3. Length: 500-1500 characters
4. Tone: Professional, thoughtful, engaging
5. Include relevant insights about AI, privacy tech, or productivity solutions
6. Add 2-3 relevant hashtags at the end

Context about Lman:
- Founder of IrisGo.AI (on-premise AI platform for personal productivity)
- Focus: Privacy-first AI, personal AI assistants for everyone
- Target users: White collar workers, knowledge workers, general users
- Expertise: LLM applications, AI governance, productivity tools
- Writing style: Direct, insightful, slightly provocative

Generate ONLY the LinkedIn post text, no explanations.`;

    // 使用 Gemini 2.5 Pro (多模態)
    const response = await geminiClient.generateContent(prompt, {
      model: 'gemini-2.5-pro',  // Pro for multimodal
      temperature: 0.7,
      maxOutputTokens: 2048,
      images: [{
        data: imageBase64,
        mimeType: mimeType
      }]
    });

    return {
      success: true,
      content: response,
      imagePath: imagePath,
      generatedAt: new Date().toISOString(),
      model: 'gemini-2.5-pro'
    };

  } catch (error) {
    console.error(`Multimodal generation error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 批量處理圖片目錄
 * @param {string} imageDir - 圖片目錄
 * @param {string} outputPath - 輸出 JSON 路徑
 */
async function batchProcessImages(imageDir, outputPath) {
  try {
    const files = fs.readdirSync(imageDir)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

    console.log(`Found ${files.length} images in ${imageDir}`);

    const results = [];
    for (const file of files) {
      const imagePath = path.join(imageDir, file);
      console.log(`\nProcessing: ${file}...`);

      const result = await generatePostFromImage(imagePath);
      results.push({
        filename: file,
        ...result
      });

      if (result.success) {
        console.log(`✅ Generated (${result.content.length} chars)`);
        console.log(`Preview: ${result.content.substring(0, 100)}...`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    }

    // 保存結果
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n✅ Results saved to ${outputPath}`);

    return results;
  } catch (error) {
    console.error(`Batch process error: ${error.message}`);
    throw error;
  }
}

// CLI 使用
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  Single image: node linkedin-multimodal-gemini.js <image-path> [topic]');
    console.log('  Batch process: node linkedin-multimodal-gemini.js --batch <image-dir> <output.json>');
    process.exit(1);
  }

  if (args[0] === '--batch') {
    const imageDir = args[1];
    const outputPath = args[2] || './linkedin-multimodal-results.json';
    batchProcessImages(imageDir, outputPath).catch(console.error);
  } else {
    const imagePath = args[0];
    const topic = args[1] || '';
    generatePostFromImage(imagePath, topic)
      .then(result => {
        if (result.success) {
          console.log('\n' + '='.repeat(70));
          console.log('Generated LinkedIn Post:');
          console.log('='.repeat(70));
          console.log(result.content);
          console.log('='.repeat(70));
        } else {
          console.error(`Error: ${result.error}`);
          process.exit(1);
        }
      })
      .catch(console.error);
  }
}

module.exports = {
  generatePostFromImage,
  batchProcessImages
};
