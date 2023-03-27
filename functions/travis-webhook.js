const crypto = require('crypto');
const fetch = require('node-fetch');
const typeis = require('type-is');
const { parse } = require('qs');

const {
  WEBHOOK_URL,
  TRAVIS_CONFIG_URL = 'https://api.travis-ci.com/config',
} = process.env;

const TYPES = {
  URLENCODED: 'urlencoded',
  JSON: 'json',
};

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
    const configResponse = await fetch(TRAVIS_CONFIG_URL);
    const publicKey = ((((await configResponse.json() || {}).config || {})
      .notifications || {}).webhook || {}).public_key;

    return crypto
      .createVerify('sha1')
      .update(payload)
      .verify(publicKey, signature, 'base64');
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
            imageUrl: 'data:image/jpeg;base64,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',
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
