@REQ-ASSURANCE-RELEASE-003
Feature: Releases use verified source

  Rule: Release evidence is collected from a clean exact source revision

    @SCN-ASSURANCE-RELEASE-01
    Scenario: Release provenance is exact
      Given the runner-neutral release assurance sources
      When its exact revision controls are inspected
      Then repository-owned GitHub execution remains absent
      And release evidence binds a clean exact source revision
