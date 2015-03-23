#!/usr/bin/env node

var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path'),
    _ = require('lodash'),
    program = require('commander'),
    util = require('./util'),
    logger = require('./logger').logger,
    git = require('gift'),  // bluebird doesn't work with this library
    StashApi = require('../../stash-api/src/app').StashApi,
    PullRequest = require('../../stash-api/src/app').models.PullRequest,
    stash = new StashApi('http', 'localhost', '7990', process.env['STASH_USERNAME'], process.env['STASH_PASSWORD']);
var hasError = false;

program
  .version('1.0.0')
  .option('-t, --ticket [id]', 'id of the ticket this is for. e.g. creview -t NGEN-1234')
  .option('-m, --message [mes]', 'Message or title of the PR. e.g. creview -m "Fixing it all"')
  .option('-s, --sections [secs]', 'Section of code. Options are [API, UI, QA]. e.g. creview -s UI,QA')
  .option('-f, --force', 'Force the PR even if the current branch has uncommited changes.')
  .parse(process.argv);

if (!program.ticket) {
    logger.error('A ticket must be supplied.');
    hasError = true;
}
if (!program.message) {
    logger.error('A message must be supplied.');
    hasError = true;
}
if (!program.sections) {
    logger.error('At least one section must be supplied.');
    hasError = true;
}

// don't continue if there is any error with the input
if (hasError) {
    logger.debug('Some of the input was invalid');
    return;
}

// git repo root path => git rev-parse --show-toplevel
util.getRepoRoot()
.then(function (repoPath) {
    logger.debug('got a repo root', {
        root: repoPath
    });
    return [
        fs.readFileAsync(path.join(repoPath + '/.creview-config')).then(function(result) { return JSON.parse(result, 'utf8'); }),
        repoPath
    ];
})
.spread(function (repoConfig, repoPath) {
    return new Promise(function (resolve) {
        git(repoPath)
        .status(function (err, status) {
            var errorMessage = 'Your current branch is not clean. You can overide this message with the -f flag. Exiting now...'; 
            if (err) {
                throw new Error('An error ocurred while getting the status of the repo.');
            }
            if (!status.clean && !program.force) {
                logger.error(errorMessage);
                throw new Error(errorMessage);
            }
            resolve([repoConfig, repoPath, ]);
        });
    });
})
.spread(function (repoConfig, repoPath) {
    // respoConfig = JSON.parse(repoConfig, 'utf8')
    // branch that the current branch should request a pull from => config file at repo root, the default parent repo?
    // can override with CLI param
    logger.debug('default branch', {
        branch: repoConfig.defaultBranch
    });
    return [repoConfig, repoPath];
})
.spread(function (repoConfig, repoPath) {
    // the list of possible reviewers => config file at repo root
    return [repoConfig, repoPath];
})
.spread(function (repoConfig, repoPath) {
    // current branch => https://www.npmjs.com/package/gift#repobranchbranch-callback
    return new Promise(function (resolve) {
        git(repoPath)
        .branch(function (err, branch) {
            logger.debug('current branch', {
                currentBranch: branch.name
            });
            resolve([repoConfig, repoPath, branch]);
        });
    });
})
.spread(function  (repoConfig, repoPath, currentBranch) {
    var reviewers, sections, pr;
    // get reviewers
    sections = program.sections.split(',');
    reviewers = util.getReviewers(repoConfig, program.sections.split(','));
    if (!reviewers || reviewers.length < 1) {
        throw new Error('No reviewers found for ' + program.sections);
    }
    
    logger.debug('reviewers found: ', {
        reviewers: reviewers
    });
    
    // create PR
    pr = new PullRequest();
    pr.title = generateTitle(sections, program.ticket, program.message);
    pr.reviewers = reviewers;
    pr.fromRef = {
        id: 'refs/heads/' + currentBranch.name,
        repository: {
            slug: repoConfig.slug,
            project: {
                key: repoConfig.projectKey
            }
        }
    };
    pr.toRef = {
        id: 'refs/heads/' + repoConfig.defaultBranch,
        repository: {
            slug: repoConfig.slug,
            project: {
                key: repoConfig.projectKey
            }
        }
    };
    stash.createPullRequest(repoConfig.projectKey, repoConfig.slug, pr)
    .spread(function (response, body) {
        if (response.statusCode === 201) {
            logger.info('successfully created pull request');
            // open chrome on the user's machine to the PR url
        } else {
            logger.error('boooooo, error while creating pull request', {
                body: body,
                statusCode: response.statusCode
            });
        }
    });
})
.catch(function (err) {
    logger.error('error in main: ' + err);
});

function generateTitle (sections, ticket, message) {
    var result = '';
    _.each(sections, function (val) {
        result += '[' + val + ']';
    });
    return result + ' ' + ticket + ' - ' + message;
}