/* tslint:disable:no-reference */
/// <reference path="ui.ts" />
/// <reference path="oauth.ts" />

// https://developers.google.com/gmail/add-ons/concepts/actions#action_event_objects
// tslint:disable-next-line:interface-name
interface ActionEvent {
  parameters: { [key: string]: string };
  formInputs: { [key: string]: string };
  messageMetadata: { accessToken: string, messageId: string };
}

function getURLs(messageBody: string) {
  const pattern = new RegExp(
    getConfig("baseURL") + "\/([\\S]+)\/([\\S]+)\/(issues|pull)\/([\\d]+)", "gi");
  const result = [];
  let match = pattern.exec(messageBody);
  while (match !== null) {
    if (match) {
      result.push(
        { user: match[1], repo: match[2], type: match[3], id: match[4] });
    }
    match = pattern.exec(messageBody);
  }
  const tempArray = [];
  let duplicate = false;
  for (const i in result) {
    if (!result[i]) {
      continue;
    }
    for (const j in tempArray) {
      if (JSON.stringify(result[i]) === JSON.stringify(tempArray[j])) {
        duplicate = true;
      }
    }
    if (duplicate) {
      duplicate = false;
    } else {
      tempArray.push(result[i]);
    }
  }
  return tempArray;
}

function queryGithub(query: string) {
  const requestResponse = accessProtectedResource("https://api.github.com/graphql", "post", JSON.stringify({ query }));
  if (requestResponse) {
    return JSON.parse(requestResponse);
  }
}

function getCommentSection(comments: Array<{ author: { login: string }, bodyHTML: string }>) {
  if (comments.length === 0) {
    return;
  }
  const commentSection = CardService.newCardSection()
    .setHeader("Comments")
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(1);
  for (const i in comments) {
    if (!comments[i]) {
      continue;
    }
    commentSection.addWidget(CardService.newTextParagraph().setText(
      `<b>${comments[i].author.login} - XX ago </b><br>${comments[i].bodyHTML}`));
  }
  return commentSection;
}

function getBodyWidget(bodyHTML: string) {
  if (bodyHTML) {
    return CardService.newTextParagraph().setText(bodyHTML);
  } else {
    return;
  }
}

function sanitizeInput(input: string) {
  const entityMap: {[key: string]: string} = {
    '"': "&quot;",
    "&": "&amp;",
    "'": "&#39;",
    "/": "&#x2F;",
    "<": "&lt;",
    "=": "&#x3D;",
    ">": "&gt;",
    "`": "&#x60;",
  };
  return String(input).replace(/[&<>"'`=\/]/g, function fromEntityMap(s) {
    return entityMap[s];
  });
}

function toggleIssueState(params: ActionEvent) {
  const operation =
    (params.parameters.currentState === "false") ? "closeIssue" : "reopenIssue";
  const getRequestResponse = accessProtectedResource(
    "https://api.github.com/graphql", "post", JSON.stringify({
      query: "mutation { " + operation + '(input:{issueId:"' + params.parameters.id +
        '"}) { clientMutationId } }',
    }),
    { Accept: "application/vnd.github.starfire-preview+json" });
  if (!getRequestResponse) {
    return;
  }
  const requestResponse = JSON.parse(getRequestResponse);
  if (!requestResponse.errors) {
    return;
  }
  const actionResponse =
    CardService.newActionResponseBuilder().setStateChanged(true);
  if (requestResponse.errors) {
    actionResponse.setNavigation(CardService.newNavigation().pushCard(
      createErrorCard(requestResponse.errors[0].message, "err")));
  } else {
    const operationString = (operation === "reopenIssue") ? "Issue reopened" : "Issue closed";
    actionResponse.setNavigation(CardService.newNavigation().pushCard(
      createErrorCard(operationString, "success")));
  }
  return actionResponse.build();
}

function addComment(params: ActionEvent) {
  const commentText = sanitizeInput(String(params.formInputs.commentText));
  const response = CardService.newActionResponseBuilder().setStateChanged(true);
  if (!commentText) {
    response.setNavigation(CardService.newNavigation().pushCard(
      createErrorCard("Comment text cannot be blank.", "err")));
    return response;
  }
  const getRequestResponse = accessProtectedResource(
    "https://api.github.com/graphql", "post", JSON.stringify({
      query: 'mutation { addComment (input:{subjectId:"' +
        params.parameters.id + '", body:"' + commentText +
        '"}) { clientMutationId } }',
    }));
  if (!getRequestResponse) {
    return;
  }
  const requestResponse = JSON.parse(getRequestResponse);
  if (requestResponse.errors) {
    response.setNavigation(CardService.newNavigation().pushCard(
      createErrorCard(requestResponse.errors[0].message, "err")));
  } else {
    response.setNavigation(CardService.newNavigation().pushCard(
      createErrorCard("Comment created", "success")));
  }
  return response.build();
}

function getConfig(property: string) {
  return PropertiesService.getScriptProperties().getProperty(property);
}

function logoutActionResponse() {
  resetOAuth();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot())
    .setStateChanged(true)
    .build();
}
