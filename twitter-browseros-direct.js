#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const { loadPersona, generateOriginalTweet, selectRandomTopic } = require('./content-generator');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Configuration
const PERSONA_FILE = '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md';
const GEMINI_API_KEY = 'AIzaSyB-I9pj22bPopvBy1VwKVo7fbsr4OU2cLk';

async function main() {
  console.log('=== Twitter Automation (BrowserOS Direct) ===');
  
  // Load persona and generate tweet
  const persona = await loadPersona(PERSONA_FILE);
  const topic = selectRandomTopic();
  const tweetText = await generateOriginalTweet(persona, topic, GEMINI_API_KEY);
  
  console.log(`\nGenerated tweet (${tweetText.length} chars):`);
  console.log('---');
  console.log(tweetText);
  console.log('---\n');
  
  console.log('This script demonstrates the tweet generation.');
  console.log('For posting, please use Happy CLI with the /twitter-curator slash command.');
  console.log('\nTo post this tweet, copy it and paste manually to Twitter.');
}

main();
