#!/usr/bin/env node

const { loadPersona, generateOriginalTweet, selectRandomTopic } = require('./content-generator');
const { exec } = require('child_process');

const PERSONA_FILE = '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md';
const GEMINI_API_KEY = 'AIzaSyB-I9pj22bPopvBy1VwKVo7fbsr4OU2cLk';

async function main() {
  const persona = await loadPersona(PERSONA_FILE);
  const topic = selectRandomTopic();
  const tweet = await generateOriginalTweet(persona, topic, GEMINI_API_KEY);
  
  console.log(JSON.stringify({
    tweet: tweet,
    length: tweet.length,
    topic: topic
  }));
  
  // Copy to clipboard
  exec(`echo "${tweet.replace(/"/g, '\\"')}" | pbcopy`);
}

main().catch(console.error);
