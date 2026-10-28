import test from 'node:test';
import assert from 'node:assert/strict';
import { tallyFormBlueprint, bindTallyQuestions } from '../src/tally-form.mjs';

test('provider field IDs refer to block groups; hidden fields share a question with distinct answer keys', () => {
  const blueprint = tallyFormBlueprint();
  const questions = blueprint.request.blocks.filter(block => !['TITLE', 'FORM_TITLE', 'TEXT'].includes(block.type)).map((block, index) => ({
    id: `question${index}`, type: block.groupType,
    fields: block.type === 'HIDDEN_FIELDS' ? block.payload.hiddenFields.map(field => ({ uuid: field.uuid, title: field.name }))
      : [{ uuid: block.groupUuid }],
  }));
  const bound = bindTallyQuestions(blueprint, questions);
  assert.equal(typeof bound.nombre, 'string');
  assert.equal(bound.plan.questionId, bound.utm_source.questionId);
  assert.notEqual(bound.plan.answerKey, bound.utm_source.answerKey);
  assert.equal(bound.source_form.answerKey, 'source_form');
  assert.throws(() => bindTallyQuestions(blueprint, []), /binding_failed/);
});
