/* tslint:disable:no-reference */
/// <reference path="utilities.ts" />

function loadAddOn(event: ActionEvent) {
    const accessToken = event.messageMetadata.accessToken;
    const messageId = event.messageMetadata.messageId;
    GmailApp.setCurrentMessageAccessToken(accessToken);
    const matches = getURLs(GmailApp.getMessageById(messageId).getPlainBody());
    return getCards(matches);
}

// Return cardlist array => 'root' card
// PR card ||
// Issue card ||
// Commit card

// Root navigation

function getCards(matches: Array<{ id: string, repo: string, user: string, type: string }>) {
    const cards = [];
    let card;
    for (const match of matches) {
        card = null;
        if (match.type === "issues") {
            card = getIssueCard(match.user, match.repo, match.id);
        } else if (match.type === "pull") {
            card = getPullCard(match.user, match.repo, match.id);
        }
        if (card) {
            cards.push(card);
        }
    }
    if (cards.length === 0) {
        cards.push(
            createErrorCard("No GitHub links found in this message.", "warn"));
    }
    return cards;
}

// Issue card
function getIssueCard(user: string, repo: string, id: string) {
    let issueData = queryGithub(`query {
        repository(owner:"${user}", name:"${repo}") {
            issue(number:${id}) {
                title closed id bodyHTML resourcePath createdAt viewerCanUpdate viewerCanReact
                author {
                    avatarUrl login url
                }
                comments(first:30) {
                    nodes {
                        bodyHTML
                        author {
                            login
                        }
                    }
                }
            }
        }
    }`);
    if (issueData.errors || !issueData.data.repository) {
        let errorMessage;
        if (issueData.errors) {
            errorMessage = issueData.errors[0].message;
        } else {
            errorMessage = "Unknown error. Do you have access to this resource?";
        }
        // Insert error card into stack if not 404?
        return createErrorCard(errorMessage, "err");
    }
    issueData = issueData.data.repository.issue;
    // Set header image
    let issueImage: string;
    if (issueData.closed) {
        issueImage = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/closed-issue.png";
    } else {
        issueImage = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/open-issue.png";
    }
    // Card header
    const card = CardService.newCardBuilder();
    card.setHeader(CardService.newCardHeader()
        .setTitle(issueData.title)
        .setSubtitle(`#${id} in ${user}/${repo}`)
        .setImageUrl(issueImage)
        .setImageAltText("Issue"));
    // Issue data section
    const infoSection = CardService.newCardSection();
    infoSection.addWidget(CardService.newKeyValue()
        // tslint:disable-next-line:max-line-length
        .setContent(`Opened by <a href="${issueData.author.url}">${issueData.author.login}</a> at <time>${issueData.createdAt}</time>`)
        .setIconUrl(issueData.author.avatarUrl)
        .setMultiline(true));
    const bodyWidget = getBodyWidget(issueData.bodyHTML);
    if (bodyWidget) {
        infoSection.addWidget(bodyWidget);
    }
    card.addSection(infoSection);
    // Issue actions widget
    const actionButtons = CardService.newButtonSet();
    actionButtons.addButton(CardService.newTextButton()
        .setText("Open in GitHub")
        .setOpenLink(CardService.newOpenLink().setUrl("https://www.github.com" + issueData.resourcePath)));
    if (issueData.viewerCanUpdate) {
        actionButtons.addButton(CardService.newTextButton()
            .setText((issueData.closed ? "Reopen" : "Close"))
            .setOnClickAction(CardService.newAction()
                .setFunctionName("toggleIssueState")
                .setParameters({
                    currentState: String(issueData.closed),
                    id: issueData.id,
                })));
    }
    card.addSection(CardService.newCardSection().addWidget(actionButtons));
    // Issue comments section
    const commentSection = getCommentSection(issueData.comments.nodes);
    if (commentSection) {
        card.addSection(commentSection);
    }
    // Add comment section
    if (issueData.viewerCanReact) {
        const addCommentSection =
            CardService.newCardSection()
                .addWidget(CardService.newTextInput()
                    .setMultiline(true)
                    .setTitle("Add a comment")
                    .setFieldName("commentText"))
                .addWidget(
                    CardService.newTextButton().setText("Comment").setOnClickAction(
                        CardService.newAction()
                            .setFunctionName("addComment")
                            .setParameters({ id: issueData.id })));
        card.addSection(addCommentSection);
    }
    return card.build();
}

// Pull request card
function getPullCard(user: string, repo: string, id: string) {
    let pullData = queryGithub(`query {
            repository(owner:"${user}", name:"${repo}") {
                pullRequest(number:${id}) {
                    title state id bodyHTML permalink baseRefName headRefName
                    changedFiles additions deletions viewerCanUpdate viewerCanReact
                    author {
                        avatarUrl login url
                    }
                    comments(first:30) {
                        nodes {
                            bodyHTML
                            author {
                                login
                            }
                        }
                    }
                    commits {
                        totalCount
                    }
                }
            }
        }`);
    if (pullData.errors || !pullData.data.repository) {
        let errorMessage;
        if (pullData.errors) {
            errorMessage = pullData.errors[0].message;
        } else {
            errorMessage = "Unknown error. Do you have access to this resource?";
        }
        return createErrorCard(errorMessage, "err");
    }
    pullData = pullData.data.repository.pullRequest;
    // Set header image
    let pullImage = "";
    let actionString = "";
    switch (pullData.state) {
        case "CLOSED":
            pullImage = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/pull-closed.png";
            // tslint:disable-next-line:max-line-length
            actionString = `wanted to merge <font color="#274466"><b>${pullData.headRefName}</b></font> into <font color="#274466"><b>${pullData.baseRefName}</b></font>`;
            break;
        case "OPEN":
            pullImage = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/pull-open.png";
            // tslint:disable-next-line:max-line-length
            actionString = `wants to merge <font color="#274466"><b>${pullData.headRefName}</b></font> into <font color="#274466"><b>${pullData.baseRefName}</b></font>`;
            break;
        case "MERGED":
            pullImage = ""; // MERGED IMAGE
            // tslint:disable-next-line:max-line-length
            actionString = `had <font color="#274466"><b>${pullData.headRefName}</b></font> merged into <font color="#274466"><b>${pullData.baseRefName}</b></font>`;
            break;
        default:
            break;
    }
    // Card header
    const card = CardService.newCardBuilder();
    card.setHeader(CardService.newCardHeader()
        .setTitle(pullData.title)
        .setSubtitle(`#${id} in ${user}/${repo}`)
        .setImageUrl(pullImage)
        .setImageAltText("Pull Request"));
    // Pull data section
    const infoSection = CardService.newCardSection();
    let commitString = "";
    if (pullData.commits.totalCount === 1) {
        commitString = "commit";
    } else {
        commitString = "commits";
    }
    let fileString = "";
    if (pullData.changedFiles === 1) {
        fileString = "file";
    } else {
        fileString = "files";
    }
    let additionString = "";
    if (pullData.additions === 1) {
        additionString = "addition";
    } else {
        additionString = "additions";
    }
    let deletionString = "";
    if (pullData.deletions === 1) {
        deletionString = "deletion";
    } else {
        deletionString = "deletions";
    }
    infoSection.addWidget(CardService.newKeyValue()
        .setContent(`<a href="${pullData.author.url}">${pullData.author.login}</a> ${actionString}`)
        .setIconUrl(pullData.author.avatarUrl)
        .setMultiline(true));
    infoSection.addWidget(CardService.newKeyValue()
        // tslint:disable-next-line:max-line-length
        .setContent(`<b>${pullData.commits.totalCount} ${commitString}</b> changing <b>${pullData.changedFiles} ${fileString}</b> with <b><font color="#28a745">${pullData.additions}</font> ${additionString}</b> and <b><font color="#cb2431">${pullData.deletions}</font> ${deletionString}</b>`)
        .setMultiline(true));
    card.addSection(infoSection);
    // Pull body section
    const bodyWidget = getBodyWidget(pullData.bodyHTML);
    if (bodyWidget) {
        card.addSection(CardService.newCardSection().setHeader("Description").addWidget(bodyWidget));
    }
    // Pull actions widget
    const actionButtons = CardService.newButtonSet().addButton(
        CardService.newTextButton()
            .setText("Open in GitHub")
            .setOpenLink(CardService.newOpenLink().setUrl(pullData.permalink)));
    card.addSection(CardService.newCardSection().addWidget(actionButtons));
    // Pull comments section
    const commentSection = getCommentSection(pullData.comments.nodes);
    if (commentSection) {
        card.addSection(commentSection);
    }
    // Add comment section
    if (pullData.viewerCanReact) {
        const addCommentSection =
            CardService.newCardSection()
                .addWidget(CardService.newTextInput()
                    .setMultiline(true)
                    .setTitle("Add a comment")
                    .setFieldName("commentText"))
                .addWidget(
                    CardService.newTextButton().setText("Comment").setOnClickAction(
                        CardService.newAction()
                            .setFunctionName("addComment")
                            .setParameters({ id: pullData.id })));
        card.addSection(addCommentSection);
    }
    return card.build();
}

// Mutation response card
function createErrorCard(message: string, type: string) {
    let imageURL = "";
    let altText = "";
    switch (type) {
        case "warn":
            imageURL = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/confused.png";
            altText = "Warning";
            break;
        case "err":
            imageURL = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/error.png";
            altText = "Error";
            break;
        case "success":
            imageURL = "https://raw.githubusercontent.com/mymindstorm/GitMail/master/img/info.png";
            altText = "Success";
            break;
    }
    return CardService.newCardBuilder()
        .addSection(CardService.newCardSection()
            .addWidget(CardService.newImage().setAltText(altText).setImageUrl(imageURL))
            .addWidget(CardService.newTextParagraph().setText(message)))
        .build();
}

// Universal Actions

function createAboutResponse() {
    return CardService.newUniversalActionResponseBuilder()
        .displayAddOnCards([createAboutCard()])
        .build();
}

function createSettingsResponse() {
    return CardService.newUniversalActionResponseBuilder()
        .displayAddOnCards([createSettingsCard()])
        .build();
}

// About card
function createAboutCard() {
    return CardService.newCardBuilder()
        .setHeader(CardService.newCardHeader().setTitle("About"))
        .addSection(CardService.newCardSection().addWidget(
            CardService.newTextParagraph().setText(
                // tslint:disable-next-line:max-line-length
                `<a href="https://github.com/mymindstorm/GitMail">GitMail</a> &copy; 2018 <a href="https://github.com/mymindstorm">Brendan Early</a><br>Source code available under the XXX license<br>`)))
        .addSection(
            CardService.newCardSection()
                .setHeader("Acknowledgments")
                .addWidget(CardService.newTextParagraph().setText(
                    // tslint:disable-next-line:max-line-length
                    `<a href="https://github.com/gsuitedevs/apps-script-oauth2">OAuth2 for Apps Script</a> by Google<br><a href="https://github.com/primer/octicons/">Octicons</a> by GitHub`)))
        .build();
}

// Settings card
function createSettingsCard() {
    const username = queryGithub("query { viewer { login }}").data.viewer.login;
    const logoutAction = CardService.newAction().setFunctionName("logoutActionResponse");
    const logoutButton = CardService.newTextButton()
        .setText("Sign out")
        .setOnClickAction(logoutAction);
    return CardService.newCardBuilder()
        .setHeader(CardService.newCardHeader().setTitle("Settings"))
        .addSection(CardService.newCardSection()
            .setHeader("Account")
            .addWidget(CardService.newTextParagraph().setText(
                // tslint:disable-next-line:max-line-length
                `You are currently signed in as <b>${(username || "err: username not found. Are you being rate limited?")}</b>`))
            .addWidget(logoutButton))
        .build();
}
