# GitMail

It's a very basic GitHub client for Gmail, currently a work in progress.

## Why?

At first I thought it was cool that you could write pseudo-apps and have it run entirely under Gmail. After discovering how restrictive the UI library is and what a pain GitHub v4 oauth access restrictions are I now regret this decision.

## Install

Go [here](https://mail.google.com/mail/u/0/#settings/addons), check "Enable developer add-ons for my account", paste `AKfycbzX4GizwsjHn8PkoXFVtTSyNZyZgksP4NM2K6JBOWM` into the box, and hit install.

## Build

`npm i @google/clasp -g`, create a new apps script project, update .clasp.json, and then run `npm build` as needed.

## Config

To be documented.
