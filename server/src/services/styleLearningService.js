const { models, sequelize } = require('../db');
const ragConfig = require('../config/ragConfig');
const embeddingService = require('./embeddingService');
const ragLogger = require('../utils/ragLogger');
const crypto = require('crypto');

class StyleLearningService {
  /**
   * Evaluates linguistic differences between two strings to propose a bounded shift
   * in style dimensions (e.g. brevity, formality) and extract vocabulary patterns.
   * 
   * Returns style shifts + vocabulary/phrase patterns extracted from edits.
   */
  _analyzeStyleDiff(original, edited) {
    const originalLength = original.length;
    const editedLength = edited.length;
    
    // 1. BREVITY ANALYSIS
    let brevityShift = 0;
    if (editedLength < originalLength * 0.8) {
      brevityShift = 0.1; // Significant shortening
    } else if (editedLength < originalLength) {
      brevityShift = 0.05; // Mild shortening
    } else if (editedLength > originalLength * 1.2) {
      brevityShift = -0.1; // Significant lengthening
    } else if (editedLength > originalLength) {
      brevityShift = -0.05; // Mild lengthening
    }

    // 2. FORMALITY ANALYSIS
    let formalityShift = 0;
    
    // Emoji analysis
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const originalEmojis = (original.match(emojiRegex) || []).length;
    const editedEmojis = (edited.match(emojiRegex) || []).length;

    if (editedEmojis < originalEmojis - 1) {
      formalityShift += 0.05; // Removing emojis = more formal
    } else if (editedEmojis > originalEmojis + 1) {
      formalityShift -= 0.05; // Adding emojis = less formal
    }
    
    // Contraction analysis (informal: "don't", formal: "do not")
    const contractionRegex = /\b(don't|won't|can't|shouldn't|wouldn't|couldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|I'm|you're|he's|she's|it's|we're|they're|I've|you've|we've|they've|I'll|you'll|he'll|she'll|we'll|they'll)\b/gi;
    const originalContractions = (original.match(contractionRegex) || []).length;
    const editedContractions = (edited.match(contractionRegex) || []).length;
    
    if (editedContractions < originalContractions) {
      formalityShift += 0.03; // Removing contractions = more formal
    } else if (editedContractions > originalContractions) {
      formalityShift -= 0.03; // Adding contractions = less formal
    }

    // 3. VOCABULARY EXTRACTION (word-level substitutions)
    const vocabularyPatterns = this._extractVocabularyPatterns(original, edited);
    
    // 4. PHRASE EXTRACTION (common expressions mentor adds)
    const phrasePatterns = this._extractPhrasePatterns(original, edited);
    
    // 5. STYLE MARKERS (casual expressions like "yar", "aisy ha", "kyyy")
    const styleMarkers = this._extractStyleMarkers(edited);

    return { 
      brevity: brevityShift, 
      formality: formalityShift,
      vocabularyPatterns,
      phrasePatterns,
      styleMarkers
    };
  }

  /**
   * Extract word-level substitutions (original word → edited word)
   */
  _extractVocabularyPatterns(original, edited) {
    const patterns = {};
    
    // Simple word tokenization
    const originalWords = original.toLowerCase().match(/\b\w+\b/g) || [];
    const editedWords = edited.toLowerCase().match(/\b\w+\b/g) || [];
    
    // Find common substitutions (heuristic: if a word in original is replaced by a similar-position word)
    // This is a simplified approach - a full diff algorithm would be more accurate
    const commonSubstitutions = [
      ['utilize', 'use'],
      ['assist', 'help'],
      ['regarding', 'about'],
      ['therefore', 'so'],
      ['however', 'but'],
      ['additionally', 'also'],
    ];
    
    commonSubstitutions.forEach(([formal, casual]) => {
      const originalHasFormal = originalWords.includes(formal);
      const editedHasCasual = editedWords.includes(casual);
      const originalHasCasual = originalWords.includes(casual);
      const editedHasFormal = editedWords.includes(formal);
      
      if (originalHasFormal && editedHasCasual && !originalHasCasual) {
        patterns[formal] = casual;
      } else if (originalHasCasual && editedHasFormal && !originalHasFormal) {
        patterns[casual] = formal;
      }
    });
    
    return patterns;
  }

  /**
   * Extract phrase patterns (expressions mentor frequently adds)
   */
  _extractPhrasePatterns(original, edited) {
    const phrases = [];
    
    // Extract phrases that appear in edited but not in original (mentor additions)
    const commonPhrases = [
      /\byar\b/gi,
      /\bscene aisy ha\b/gi,
      /\bdekhte hain\b/gi,
      /\bchalo\b/gi,
      /\bsamajh gaya\b/gi,
      /\bin my experience\b/gi,
      /\bi think\b/gi,
      /\blet me know\b/gi,
      /\bfeel free to\b/gi,
      /\bhappy to help\b/gi,
    ];
    
    commonPhrases.forEach(regex => {
      const inEdited = edited.match(regex);
      const inOriginal = original.match(regex);
      
      if (inEdited && !inOriginal) {
        phrases.push(inEdited[0].toLowerCase());
      }
    });
    
    return phrases;
  }

  /**
   * Extract style markers (casual expressions, Urdu phrases, elongations)
   */
  _extractStyleMarkers(text) {
    const markers = [];
    
    // Elongated words (e.g., "kyyy", "haiii")
    const elongationRegex = /\b\w*([a-z])\1{2,}\w*\b/gi;
    const elongations = text.match(elongationRegex) || [];
    if (elongations.length > 0) {
      markers.push('uses_elongation');
    }
    
    // Common Urdu/Hindi casual markers
    const urduMarkers = ['yar', 'bhai', 'scene', 'matlab', 'dekho', 'chalo', 'acha', 'theek'];
    const hasUrdu = urduMarkers.some(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
    if (hasUrdu) {
      markers.push('uses_urdu_casual');
    }
    
    // Exclamation patterns
    if (text.includes('!!') || text.includes('!!!')) {
      markers.push('uses_multiple_exclamations');
    }
    
    return markers;
  }

  /**
   * Applies a proposed shift to a style vector, ensuring no single shift exceeds 
   * `maxStyleDeltaPerUpdate` and values stay bounded between 0 and 1.
   */
  _applyBoundedShift(currentValue, proposedShift, maxDelta) {
    const safeCurrent = typeof currentValue === 'number' ? currentValue : 0.5; // Default middle
    const boundedShift = Math.max(-maxDelta, Math.min(maxDelta, proposedShift));
    return Math.max(0, Math.min(1, safeCurrent + boundedShift));
  }

  async processEditHistory(editHistoryId) {
    const editHistory = await models.MentorEditHistory.findByPk(editHistoryId);
    if (!editHistory || editHistory.processed) {
      return null;
    }

    return sequelize.transaction(async (transaction) => {
      // 1. Re-embed the final approved text as Level-4 Reference
      try {
        const contentHash = crypto.createHash('sha256').update(editHistory.finalContent).digest('hex');
        
        // Ensure idempotency
        const existingChunk = await models.KnowledgeChunk.findOne({
          where: {
            sourceType: 'message',
            sourceId: editHistory.id,
            chunkIndex: 0,
            contentHash
          },
          transaction
        });

        if (!existingChunk) {
          const embeddingVector = await embeddingService.getEmbedding(editHistory.finalContent);
          
          await models.KnowledgeChunk.create({
            sourceType: 'message',
            sourceId: editHistory.id,
            chunkIndex: 0,
            contentHash,
            content: editHistory.finalContent,
            embedding: `[${embeddingVector.join(',')}]`,
            mentorId: editHistory.mentorId,
            visibility: 'mentor'
          }, { transaction });
          
          ragLogger.info('style_learning_chunk_embedded', { mentorId: editHistory.mentorId, editHistoryId });
        }
      } catch (err) {
        ragLogger.error('style_learning_embedding_failed', { editHistoryId, error: err.message });
        // We do not throw here to allow style profile learning to continue even if embedding fails
      }

      // 2. Style Learning (Only if significant)
      if (editHistory.editDistance >= ragConfig.editDistanceSignificanceThreshold) {
        let styleProfile = await models.MentorStyleProfile.findOne({
          where: { mentorId: editHistory.mentorId },
          lock: transaction.LOCK.UPDATE,
          transaction
        });

        if (!styleProfile) {
          styleProfile = await models.MentorStyleProfile.create({
            mentorId: editHistory.mentorId,
            tone: { brevity: 0.5, formality: 0.5 },
            vocabularyPreferences: {},
            phrasePatterns: [],
            styleExamples: []
          }, { transaction });
        }

        const originalTone = { ...styleProfile.tone };
        const analysis = this._analyzeStyleDiff(editHistory.originalContent, editHistory.finalContent);
        
        const maxDelta = ragConfig.maxStyleDeltaPerUpdate;
        
        // Update tone with bounded shifts
        const updatedTone = {
          brevity: this._applyBoundedShift(originalTone.brevity, analysis.brevity, maxDelta),
          formality: this._applyBoundedShift(originalTone.formality, analysis.formality, maxDelta)
        };

        // Merge vocabulary patterns
        const currentVocab = styleProfile.vocabularyPreferences || {};
        const updatedVocab = { ...currentVocab, ...analysis.vocabularyPatterns };
        
        // Add new phrase patterns (keep last 10)
        const currentPhrases = styleProfile.phrasePatterns || [];
        const newPhrases = [...new Set([...currentPhrases, ...analysis.phrasePatterns])].slice(-10);
        
        // Add style example (keep last 5 approved messages as examples)
        const currentExamples = styleProfile.styleExamples || [];
        const updatedExamples = [...currentExamples, editHistory.finalContent].slice(-5);

        await styleProfile.update({ 
          tone: updatedTone,
          vocabularyPreferences: updatedVocab,
          phrasePatterns: newPhrases,
          styleExamples: updatedExamples
        }, { transaction });

        ragLogger.info('style_profile_updated', {
          mentorId: editHistory.mentorId,
          editHistoryId,
          toneBefore: originalTone,
          toneAfter: updatedTone,
          shifts: { brevity: analysis.brevity, formality: analysis.formality },
          vocabAdded: Object.keys(analysis.vocabularyPatterns).length,
          phrasesAdded: analysis.phrasePatterns.length,
          styleMarkers: analysis.styleMarkers
        });
      } else {
        ragLogger.info('style_learning_skipped', { 
          mentorId: editHistory.mentorId, 
          editHistoryId, 
          reason: 'Edit distance below significance threshold' 
        });
      }

      // 3. Mark as processed
      await editHistory.update({ processed: true }, { transaction });
      
      return true;
    });
  }
}

module.exports = new StyleLearningService();
