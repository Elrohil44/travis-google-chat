exports.handler = async ({
  headers,
  body,
}) => {
  console.log(headers);
  console.log(body);
  return {
    statusCode: 200,
    body: 'Hello, World!'
  };
}
