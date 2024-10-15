const crypto = require('crypto');
const fetch = require('node-fetch');
const typeis = require('type-is');
const { parse } = require('qs');

const {
  WEBHOOK_URL,
  TRAVIS_CONFIG_URL = 'https://api.travis-ci.com/config',
  DEBUG,
} = process.env;

const TYPES = {
  URLENCODED: 'urlencoded',
  JSON: 'json',
};

const isDebug = DEBUG === 'true';

const debug = (...args) => {
  if (isDebug) {
    console.log(...args);
  }
}

const parseBody = ({ body, ...req }) => {
  const type = typeis(req, [
    TYPES.URLENCODED,
    TYPES.JSON,
  ]);
  debug(`Request type: ${type}`);
  try {
    switch (type) {
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
    debug(e);
    return {};
  }
};

const verifySignature = async ({ payload, signature = '' }) => {
  try {
    const configResponse = await fetch(TRAVIS_CONFIG_URL);
    const publicKey = ((((await configResponse.json() || {}).config || {})
      .notifications || {}).webhook || {}).public_key;
    debug(publicKey, signature);

    return crypto
      .createVerify('sha1')
      .update(payload)
      .verify(publicKey, signature, 'base64');
  } catch (e) {
    debug(e)
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
  pull_request_title, branch, duration,
}, { 'travis-repo-slug': repositorySlug }) => {
  const color = getColor(state);
  const minutes = Number(Math.floor(duration / 60) || 0).toFixed(0);
  const seconds = Number(duration % 60).toFixed(0) || 0;
  const time = minutes
    ? `in ${minutes} min${seconds ? ` ${seconds} sec` : ''}`
    : `in ${seconds} seconds`;
  const message = type === 'pull_request'
    ? `<b><font color="${color}">Build <a href="${build_url}">#${number}</a></font></b> (<a href="${compare_url}">${commit.substr(0, 8)}</a>) of <b>${
      repositorySlug}@${branch}</b> in <b>PR <a href="${compare_url}">#${pull_request_number} ${pull_request_title}</a></b>`
    + ` by ${author_name} ${state} ${time}`
    : `<b><font color="${color}">Build <a href="${build_url}">#${number}</a></font></b> (<a href="${compare_url}">${commit.substr(0, 8)}</a>) of <b>${
      repositorySlug}@${branch}</b> by ${author_name} ${state} ${time}`;

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      cards: [
        {
          header: {
            title: 'Travis CI',
            subtitle: `${repositorySlug}@${branch}`,
            imageUrl: 'https://travis-webhook.netlify.app/assets/travis-logo.png',
            imageStyle: 'IMAGE',
          },
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
            {
              widgets: [
                {
                  buttons: [
                    {
                      textButton: {
                        text: 'Show build',
                        onClick: {
                          openLink: {
                            url: build_url,
                          },
                        },
                      },
                    },
                    {
                      textButton: {
                        text: type === 'pull_request'
                          ? 'Show PR' : 'Commit info',
                        onClick: {
                          openLink: {
                            url: compare_url,
                          },
                        },
                      },
                    },
                  ],
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

  debug(`Is payload set: ${!!payload}`);

  if (!payload || !await verifySignature({ payload, signature })) {
    debug('Payload missing or invalid signature');
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
