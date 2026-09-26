import { describe, expect, it } from 'vitest'
import { codeRuns, readOpenApi, typeOf } from '../src/lib/openapi'

const doc = {
  paths: {
    '/api/v1/channels/{login}': {
      patch: {
        tags: ['data'],
        description: 'Change a channel.\n\nOnly the fields you send change.',
        parameters: [{ name: 'login', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelPatch' } } } },
        responses: { '200': { description: 'Successful Response' }, '422': { description: 'Validation Error' } },
      },
    },
    '/api/v1/site': { get: { tags: ['site'], summary: 'Site', responses: {} } },
    '/admin': { get: { tags: ['web'], responses: {} } },
  },
  components: {
    schemas: {
      ChannelPatch: {
        required: ['prefix'],
        properties: {
          prefix: { anyOf: [{ type: 'string', maxLength: 16 }, { type: 'null' }] },
          reply_hold_ms: { type: 'integer', minimum: 0, maximum: 5000, default: 0 },
          automod_action: { enum: ['off', 'delete', 'timeout'] },
          badges: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

describe('readOpenApi', () => {
  it('groups by tag in reading order, leaving out the old server-rendered pages', () => {
    expect(readOpenApi(doc).map((g) => g.tag)).toEqual(['site', 'data'])
  })

  it('reads summaries, parameters, bodies and responses', () => {
    const [, data] = readOpenApi(doc)
    const patch = data!.endpoints[0]!
    expect(patch.method).toBe('PATCH')
    expect(patch.summary).toBe('Change a channel.')
    expect(patch.params).toEqual([{ name: 'login', in: 'path', type: 'string', required: true, description: '' }])
    expect(patch.body!.map((f) => [f.name, f.type, f.required, f.description])).toEqual([
      ['prefix', 'string ≤ 16', true, ''],
      ['reply_hold_ms', 'integer 0–5000', false, 'Default 0.'],
      ['automod_action', 'off | delete | timeout', false, ''],
      ['badges', 'string[]', false, ''],
    ])
    expect(patch.responses.map((r) => r.code)).toEqual(['200', '422'])
    expect(readOpenApi(doc)[0]!.endpoints[0]!.summary).toBe('Site') // no docstring: FastAPI's summary
  })
})

describe('helpers', () => {
  it('names a nullable type by what it holds', () => {
    expect(typeOf(doc, { anyOf: [{ type: 'boolean' }, { type: 'null' }] })).toBe('boolean')
  })
  it('cuts backticked code out of docstrings', () => {
    expect(codeRuns('the `!join` path')).toEqual([
      { text: 'the ', code: false }, { text: '!join', code: true }, { text: ' path', code: false },
    ])
  })
})
