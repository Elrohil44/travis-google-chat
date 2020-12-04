const crypto = require('crypto');
const fetch = require('node-fetch');
const typeis = require('type-is');
const { parse } = require('qs');

const {
  WEBHOOK_URL,
  TRAVIS_CONFIG_URL = 'https://api.travis-ci.org/config',
} = process.env;

const TYPES = {
  URLENCODED: 'urlencoded',
  JSON: 'json',
};

const relativeTimeFormat = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
  style: 'short',
});

const parseBody = ({ body, ...req }) => {
  try {
    switch (typeis(req, [
      TYPES.URLENCODED,
      TYPES.JSON,
    ])) {
      case TYPES.URLENCODED: {
        return parse(body);
      }
      case TYPES.JSON: {
        return JSON.parse(body);
      }
      default:
        return {};
    }
  } catch (e) {
    return {};
  }
};

const verifySignature = async ({ payload, signature = '' }) => {
  try {
    const configResposne = await fetch(TRAVIS_CONFIG_URL);
    const publicKey = (await configResposne.json())?.config
      ?.notifications?.webhook?.public_key;

    return crypto
      .createVerify('sha1')
      .update(payload)
      .verify(publicKey, Buffer.from(signature, 'base64'));
  } catch (e) {
    return false;
  }
};

const getColor = (state) => {
  switch (state) {
    case 'passed':
      return '#23bd23';
    case 'canceled':
      return '#cb5e0c';
    default:
      return '#b12222';
  }
};

const postMessage = async ({
  number, type, state, build_url, compare_url,
  commit, author_name, pull_request_number,
  pull_request_title, branch, duration, pull_request_url,
}, { 'Travis-Repo-Slug': repositorySlug }) => {
  const color = getColor(state);
  const message = type === 'pull_request'
    ? `<font color="${color}">Build <a href="${build_url}">#${number}</a></font> (<a href="${compare_url}">${commit}</a>) of ${
      repositorySlug}@${branch} in PR <a href="${pull_request_url}">#${pull_request_number} <b>${pull_request_title}</b></a>`
    + ` by ${author_name} ${state} in ${relativeTimeFormat.format(duration, 'second')}`
    : `<font color="${color}">Build <a href="${build_url}">#${number}</a></font> (<a href="${compare_url}">${commit}</a>) of ${
      repositorySlug}@${branch} by ${author_name} ${state} in ${relativeTimeFormat.format(duration, 'second')}`;

  await fetch({
    method: 'POST',
    url: WEBHOOK_URL,
    body: JSON.stringify({
      cards: [
        {
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: message,
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  });
};

exports.handler = async (req) => {
  const { headers: { signature } } = req;
  const { payload } = parseBody(req);

  if (!payload || !await verifySignature({ payload, signature })) {
    return {
      statusCode: 200,
      body: '',
    };
  }

  try {
    await postMessage(JSON.parse(payload), req.headers);
  } catch (e) {
    console.error(e);
  }
  return {
    statusCode: 200,
    body: '',
  };
};
